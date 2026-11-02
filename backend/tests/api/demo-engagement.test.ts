import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { article } from "../../src/db/schema.js";
import { demoAllowedFor } from "../../src/lib/demo-engagement.js";
import type { ArticleCard, DemoEngagementStatus } from "../../src/shared/contracts.js";
import { adminUser, cleanupFixtures, client, freshApp, json, publishArticle, reporterUser } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  // Leave demo mode off and the numbers cleared for the rest of the suite.
  const desk = await adminUser(app);
  await desk.req("/api/admin/demo", { json: { action: "reset" } });
  await desk.req("/api/admin/demo", { json: { action: "disable" } });
  await cleanupFixtures();
  await closeDatabase();
});

describe("Demo engagement (local / staging only)", () => {
  it("can never be allowed on the public site", () => {
    expect(demoAllowedFor("https://www.webnewsx.com", true, "1")).toBe(false);
    expect(demoAllowedFor("https://webnewsx.com", false, undefined)).toBe(false);
    expect(demoAllowedFor("https://webnews.in", true, "1")).toBe(false);
    expect(demoAllowedFor("https://staging.webnewsx.com", true, undefined)).toBe(false);
    expect(demoAllowedFor("https://staging.webnewsx.com", true, "1")).toBe(true);
    expect(demoAllowedFor("http://localhost:3000", false, undefined)).toBe(true);
    expect(demoAllowedFor("https://www.webnewsx.com", true, "public")).toBe(true);
  });

  it("generates 1–200 numbers apart from real counts, shows real + demo only while on, resets cleanly", async () => {
    const reporter = await reporterUser(app);
    const story = await publishArticle(reporter);
    const desk = await adminUser(app);
    const reader = client(app);
    expect((await reader.req("/api/admin/demo", { json: { action: "generate" } })).status).toBe(401);

    const gen = await json<DemoEngagementStatus>(await desk.req("/api/admin/demo", { json: { action: "generate" } }));
    expect(gen.allowed).toBe(true);
    expect(gen.stories).toBeGreaterThan(0);
    const [row] = await db.select().from(article).where(eq(article.id, story.id));
    for (const n of [row!.demoViews, row!.demoLikes, row!.demoShares]) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(200);
    }
    expect(row!.viewCount).toBe(0); // the real count is untouched

    const cardOf = async () => (await json<{ items: ArticleCard[] }>(await reader.req(`/api/users/${reporter.username}/articles?status=published`))).items[0]!;
    expect((await cardOf()).viewCount).toBe(0); // generated but not switched on: real only

    await desk.req("/api/admin/demo", { json: { action: "enable" } });
    const on = await cardOf();
    expect(on.viewCount).toBe(row!.demoViews);
    expect(on.likeCount).toBe(row!.demoLikes);

    // A real like still counts, on top of the demo number.
    const like = await json<{ likeCount: number }>(await reader.req(`/api/articles/${story.id}/like`, { method: "POST" }));
    expect(like.likeCount).toBe(row!.demoLikes + 1);
    const [after] = await db.select({ likeCount: article.likeCount }).from(article).where(eq(article.id, story.id));
    expect(after!.likeCount).toBe(1);

    await desk.req("/api/admin/demo", { json: { action: "disable" } });
    expect((await cardOf()).viewCount).toBe(0);
    const reset = await json<DemoEngagementStatus>(await desk.req("/api/admin/demo", { json: { action: "reset" } }));
    expect(reset.demo).toEqual({ views: 0, likes: 0, shares: 0, followers: 0 });
  });
});
