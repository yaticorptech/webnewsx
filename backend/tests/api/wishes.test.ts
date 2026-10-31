import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { Wish } from "../../src/shared/contracts.js";
import { cleanupFixtures, client, freshApp, json, onboardedUser } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe("Wishes (birthday wishes & invitations)", () => {
  it("any member posts one without a Press Pass; everyone sees it; its author removes it", async () => {
    const member = await onboardedUser(app);
    const bad = await member.req("/api/wishes", { json: { kind: "invitation", template: "elegant", title: "House warming" } });
    expect(bad.status).toBe(400);
    // Invitations need a Press Pass (owner 2026-10-31).
    const invite = await member.req("/api/wishes", { json: { kind: "invitation", template: "elegant", title: "House warming", eventAt: new Date(Date.now() + 86_400_000).toISOString() } });
    expect(invite.status).toBe(403);
    const res = await member.req("/api/wishes", { json: { kind: "birthday", template: "confetti", title: "Asha", message: "Happy birthday!" } });
    expect(res.status, await res.clone().text()).toBe(201);
    const { wish } = await json<{ wish: Wish }>(res);
    const list = await json<{ items: Wish[] }>(await client(app).req("/api/wishes"));
    expect(list.items.some((w) => w.id === wish.id && w.canDelete === false)).toBe(true);
    // Quick wishes: only the offered ones; the same one twice counts once.
    const friend = await onboardedUser(app);
    expect((await friend.req(`/api/wishes/${wish.id}/comments`, { json: { body: "anything" } })).status).toBe(400);
    const sent = await friend.req(`/api/wishes/${wish.id}/comments`, { json: { body: "🎂 Happy birthday!" } });
    expect(sent.status, await sent.clone().text()).toBe(201);
    const swapped = await friend.req(`/api/wishes/${wish.id}/comments`, { json: { body: "🙏 God bless you!" } });
    const after = await json<{ commentCount: number; comments: { body: string }[] }>(swapped);
    expect(after.commentCount).toBe(1);
    expect(after.comments[0]?.body).toBe("🙏 God bless you!");
    expect((await json<{ commentCount: number }>(sent)).commentCount).toBe(1);
    const again = await json<{ items: Wish[] }>(await client(app).req("/api/wishes"));
    expect(again.items.find((w) => w.id === wish.id)?.commentCount).toBe(1);
    expect((await member.req(`/api/wishes/${wish.id}`, { method: "DELETE" })).status).toBe(204);
  });
});
