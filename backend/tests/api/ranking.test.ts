import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { ArticleCard, Page, TrendingHeadline } from "../../src/shared/contracts.js";
import { cleanupFixtures, client, freshApp, json, onboardedUser, publishArticle, type Client, reporterUser } from "../helpers.js";

/*
 * "For You" ranking against the shared database: assertions only compare this file's own fixture
 * stories with each other (demo content and other data may rank anywhere around them).
 */
const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

async function forYouPage(c: Client, cursor?: string | null, limit = 30): Promise<Page<ArticleCard>> {
  const qs = new URLSearchParams({ tab: "foryou", limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  const res = await c.req(`/api/feed?${qs}`);
  expect(res.status, await res.clone().text()).toBe(200);
  return json<Page<ArticleCard>>(res);
}

/** Walks For You pages until every id in `want` has been seen (bounded); returns the cards in order. */
async function forYouCards(c: Client, want: string[], maxPages = 20): Promise<ArticleCard[]> {
  const seen: ArticleCard[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await forYouPage(c, cursor);
    seen.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor || want.every((id) => seen.some((card) => card.id === id))) break;
  }
  return seen;
}

async function forYouOrder(c: Client, want: string[]): Promise<string[]> {
  return (await forYouCards(c, want)).map((card) => card.id);
}

/** A fresh anonymous visitor who counts one view of each id (gets its own wn_vid cookie). */
async function anonymousView(ids: string[]): Promise<void> {
  const visitor = client(app);
  const res = await visitor.req("/api/views", { json: { ids } });
  expect(res.status).toBe(200);
}

describe("GET /api/feed?tab=foryou", () => {
  it("ranks an engaged older story above a newer quiet one", async () => {
    const [author, quietAuthor, ...fans] = await Promise.all([
      reporterUser(app),
      reporterUser(app),
      onboardedUser(app),
      onboardedUser(app),
      onboardedUser(app),
    ]);
    const engaged = await publishArticle(author!, "Engaged story everyone is reading");
    for (const fan of fans) expect((await fan.req(`/api/articles/${engaged.id}/like`, { method: "POST" })).status).toBe(200);
    for (let i = 0; i < 4; i++) await anonymousView([engaged.id]);
    expect((await client(app).req(`/api/articles/${engaged.id}/share`, { json: { channel: "copy" } })).status).toBe(200);

    const quiet = await publishArticle(quietAuthor!, "Newer story nobody has opened yet");
    expect(Date.parse(quiet.publishedAt)).toBeGreaterThan(Date.parse(engaged.publishedAt));

    const order = await forYouOrder(client(app), [engaged.id, quiet.id]);
    expect(order).toContain(engaged.id);
    expect(order).toContain(quiet.id);
    expect(order.indexOf(engaged.id)).toBeLessThan(order.indexOf(quiet.id));

    // Latest stays chronological: the newer story comes first there.
    const latest = await json<Page<ArticleCard>>(await client(app).req("/api/feed?tab=latest&limit=30"));
    const ids = latest.items.map((i) => i.id);
    expect(ids.indexOf(quiet.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(quiet.id)).toBeLessThan(ids.indexOf(engaged.id));
  });

  it("puts a brand-new story on page 1 (cold start), for visitors and readers", async () => {
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const story = await publishArticle(author, "Just filed: brand-new story");

    const anonymous = await forYouPage(client(app), null, 10);
    expect(anonymous.items).toHaveLength(10);
    expect(anonymous.items.map((i) => i.id)).toContain(story.id);

    const personal = await forYouPage(reader, null, 10);
    expect(personal.items.map((i) => i.id)).toContain(story.id);
    const card = personal.items.find((i) => i.id === story.id);
    expect(card?.viewer).toEqual({ liked: false, followingAuthor: false, isAuthor: false, saved: false, reported: null });
  });

  it("marks cards with the viewer's like / follow / author flags", async () => {
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const story = await publishArticle(author, "From a publisher you follow");
    expect((await reader.req(`/api/users/${author.username}/follow`, { method: "POST" })).status).toBe(200);
    expect((await reader.req(`/api/articles/${story.id}/like`, { method: "POST" })).status).toBe(200);

    const card = (await forYouCards(reader, [story.id])).find((i) => i.id === story.id);
    expect(card?.viewer).toMatchObject({ liked: true, followingAuthor: true, isAuthor: false });
    const own = (await forYouCards(author, [story.id])).find((i) => i.id === story.id);
    expect(own?.viewer.isAuthor).toBe(true);
  });

  it("paginates with a stable { asOf, offset } cursor without duplicates", { retry: 2 }, async () => {
    const author = await reporterUser(app);
    const stories = [];
    for (let i = 0; i < 3; i++) stories.push(await publishArticle(author, `Paging story ${i}`));

    const visitor = client(app);
    const all: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 60; page++) {
      const result: Page<ArticleCard> = await forYouPage(visitor, cursor, 4);
      expect(result.items.length).toBeLessThanOrEqual(4);
      all.push(...result.items.map((i) => i.id));
      cursor = result.nextCursor;
      if (!cursor) break;
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { asOf: string; offset: number };
      expect(decoded.offset).toBe((page + 1) * 4);
    }
    expect(new Set(all).size).toBe(all.length);
    for (const story of stories) expect(all).toContain(story.id);
  });

  it("rejects malformed cursors and keeps the chronological default without a tab", async () => {
    expect((await app.request("/api/feed?tab=foryou&cursor=garbage")).status).toBe(400);
    const latestCursor = Buffer.from(JSON.stringify(["2026-09-24T10:00:00.000Z", "00000000-0000-4000-8000-000000000000"])).toString("base64url");
    expect((await app.request(`/api/feed?tab=foryou&cursor=${latestCursor}`)).status).toBe(400);
    expect((await app.request("/api/feed?tab=foryou")).status).toBe(200);
  });
});

describe("GET /api/feed/trending", () => {
  it("returns up to 5 stories ranked by engagement in the last 24h, with counts", async () => {
    const author = await reporterUser(app);
    const fans = await Promise.all([onboardedUser(app), onboardedUser(app), onboardedUser(app)]);
    const hot = await publishArticle(author, "Trending: the story of the day");
    for (const fan of fans) await fan.req(`/api/articles/${hot.id}/like`, { method: "POST" });
    for (let i = 0; i < 3; i++) await anonymousView([hot.id]);
    for (let i = 0; i < 20; i++) await client(app).req(`/api/articles/${hot.id}/share`, { json: { channel: "copy" } });

    const res = await app.request("/api/feed/trending");
    expect(res.status).toBe(200);
    const { items } = await json<{ items: TrendingHeadline[] }>(res);
    expect(items.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < items.length; i++) expect(items[i]!.score).toBeLessThanOrEqual(items[i - 1]!.score);

    // Our story: 3 views + 3·4 likes + 20·6 shares = 135 in the last 24h.
    const ours = items.find((i) => i.id === hot.id);
    if (ours) {
      expect(ours).toMatchObject({ slug: hot.slug, title: hot.title, author: { username: author.username, name: "Test Publisher" } });
      expect(ours).toMatchObject({ viewCount: 3, likeCount: 3, shareCount: 20, score: 135 });
    } else {
      // Busier stories may outrank it; then every listed story must score at least as much.
      expect(items).toHaveLength(5);
      for (const item of items) expect(item.score).toBeGreaterThanOrEqual(135);
    }
    expect((await json<{ items: TrendingHeadline[] }>(await app.request("/api/feed/trending?limit=2"))).items.length).toBeLessThanOrEqual(2);
  });
});
