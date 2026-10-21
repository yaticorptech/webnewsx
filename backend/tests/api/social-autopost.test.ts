import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { socialConnection, socialPost } from "../../src/db/schema.js";
import { encryptToken, decryptToken, makeConnectTicket, makeOAuthState, readConnectTicket, readOAuthState } from "../../src/lib/social-crypto.js";
import type { SocialStatus } from "../../src/shared/contracts.js";
import { cleanupFixtures, freshApp, json, onboardedUser, publishArticle, reporterUser } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe("auto-post to Instagram / Facebook", () => {
  it("tokens round-trip encrypted; login state is signed and tied to its user + provider", () => {
    const sealed = encryptToken("secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(decryptToken(sealed)).toBe("secret-token");
    const state = makeOAuthState("user-1", "instagram", "nonce-1", true);
    expect(readOAuthState(state, "instagram")).toEqual({ userId: "user-1", nonce: "nonce-1", app: true });
    expect(readOAuthState(state, "facebook")).toBeNull();
    expect(readOAuthState(`${state}x`, "instagram")).toBeNull();
    // The app's one-time pass: only for its provider, and never usable as a login state.
    const ticket = makeConnectTicket("user-1", "facebook");
    expect(readConnectTicket(ticket, "facebook")).toBe("user-1");
    expect(readConnectTicket(ticket, "instagram")).toBeNull();
    expect(readOAuthState(ticket, "facebook")).toBeNull();
  });

  it("only verified reporters are eligible; publishing queues a post per connected account; the poster sends it", async () => {
    const reader = await onboardedUser(app);
    expect((await json<SocialStatus>(await reader.req("/api/social"))).eligible).toBe(false);

    const reporter = await reporterUser(app);
    const status = await json<SocialStatus>(await reporter.req("/api/social"));
    expect(status.eligible).toBe(true);
    expect(status.connections).toEqual([]);

    await db.insert(socialConnection).values([
      { userId: reporter.userId, provider: "instagram", accountId: "1784", accountName: "test.ig", tokenEnc: encryptToken("ig") },
      { userId: reporter.userId, provider: "facebook", accountId: "555", accountName: "Test Page", tokenEnc: encryptToken("fb") },
    ]);
    const story = await publishArticle(reporter);
    const queued = await db.select().from(socialPost).where(eq(socialPost.articleId, story.id));
    expect(queued.map((p) => p.status).sort()).toEqual(["waiting", "waiting"]);
    expect((await json<{ wanted: boolean }>(await reporter.req(`/api/social/poster/${story.id}`))).wanted).toBe(true);

    const poster = await sharp({ create: { width: 360, height: 640, channels: 3, background: "#e30613" } }).jpeg().toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(poster)], { type: "image/jpeg" }), "poster.jpg");
    const sent = await reporter.req(`/api/social/poster/${story.id}`, { method: "POST", body: form });
    expect(await json(sent)).toEqual({ queued: 2 });
    const after = await db.select().from(socialPost).where(eq(socialPost.articleId, story.id));
    expect(after.every((p) => p.status === "pending" && p.imageKey?.endsWith(`social-${story.id}.jpg`))).toBe(true);

    const withAccounts = await json<SocialStatus>(await reporter.req("/api/social"));
    expect(withAccounts.connections.map((c) => c.provider).sort()).toEqual(["facebook", "instagram"]);
    expect(withAccounts.connections[0]?.lastPost?.status).toBe("pending");

    // Disconnecting stops what was queued for it.
    await reporter.req("/api/social/instagram", { method: "DELETE" });
    const [ig] = await db.select().from(socialPost).where(eq(socialPost.articleId, story.id)).then((rows) => rows.filter((p) => p.provider === "instagram"));
    expect(ig?.status).toBe("failed");
  });
});
