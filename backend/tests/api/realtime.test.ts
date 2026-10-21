import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { closeDatabase } from "../../src/db/client.js";
import { env } from "../../src/env.js";
import { RealtimeBus, type RealtimeEvent } from "../../src/lib/realtime.js";
import { cleanupFixtures, freshApp, onboardedUser, publishArticle, waitFor, reporterUser } from "../helpers.js";

const app = freshApp();
// A dedicated LISTEN connection for this file (the same code path the server uses).
const bus = new RealtimeBus({ databaseUrl: env.DATABASE_URL });
const events: RealtimeEvent[] = [];
let unsubscribe: () => void = () => {};

beforeAll(async () => {
  await bus.start();
  unsubscribe = bus.subscribe((event) => events.push(event));
});

afterAll(async () => {
  unsubscribe();
  await bus.stop();
  await cleanupFixtures();
  await closeDatabase();
});

const eventsFor = (id: string, name?: RealtimeEvent["name"]) =>
  events.filter((e) => "id" in e.data && e.data.id === id && (name === undefined || e.name === name));

describe("realtime bus (LISTEN webnews_events)", () => {
  it("delivers article.published with the full card, coalesced stats, and article.deleted", async () => {
    const author = await reporterUser(app);
    const fans = [await onboardedUser(app), await onboardedUser(app), await onboardedUser(app)];

    const article = await publishArticle(author);
    await waitFor(() => eventsFor(article.id, "article.published").length > 0, 10_000, "article.published");
    const published = eventsFor(article.id, "article.published")[0];
    if (published?.name !== "article.published") throw new Error("unreachable");
    expect(published.data).toMatchObject({
      id: article.id,
      slug: article.slug,
      title: article.title,
      author: { username: author.username },
      viewer: { liked: false, followingAuthor: false, isAuthor: false },
    });
    expect(eventsFor(article.id, "article.published")).toHaveLength(1);

    // Three likes in quick succession → at most leading + trailing stats events, the last one fresh.
    for (const fan of fans) expect((await fan.req(`/api/articles/${article.id}/like`, { method: "POST" })).status).toBe(200);
    await waitFor(
      () => eventsFor(article.id, "article.stats").some((e) => e.name === "article.stats" && e.data.likeCount === 3),
      10_000,
      "article.stats likeCount=3",
    );
    const stats = eventsFor(article.id, "article.stats");
    expect(stats.length).toBeGreaterThanOrEqual(1);
    expect(stats.length).toBeLessThanOrEqual(2);
    expect(stats.at(-1)?.data).toEqual({ id: article.id, viewCount: 0, likeCount: 3, shareCount: 0, commentCount: 0 });

    expect((await author.req(`/api/articles/${article.id}`, { method: "DELETE" })).status).toBe(204);
    await waitFor(() => eventsFor(article.id, "article.deleted").length > 0, 10_000, "article.deleted");
    expect(eventsFor(article.id, "article.deleted")[0]?.data).toEqual({ id: article.id });
  });

  it("does not announce drafts", async () => {
    const author = await reporterUser(app);
    const res = await author.req("/api/articles", { json: { title: "Quiet draft", action: "draft" } });
    const { article } = (await res.json()) as { article: { id: string } };
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(eventsFor(article.id)).toEqual([]);
  });
});

describe("GET /api/stream (SSE)", () => {
  it("streams ready + retry, then article.published; cleans up on abort", async () => {
    const streamBus = new RealtimeBus({ databaseUrl: env.DATABASE_URL });
    const sseApp = createApp({ logRequests: false, bus: streamBus });
    try {
      const res = await sseApp.request("/api/stream", { headers: { origin: env.FRONTEND_URL } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
      expect(res.headers.get("access-control-allow-origin")).toBe(env.FRONTEND_URL);
      expect(res.headers.get("access-control-allow-credentials")).toBe("true");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const readUntil = async (needle: string, timeoutMs = 10_000) => {
        const deadline = Date.now() + timeoutMs;
        while (!text.includes(needle)) {
          if (Date.now() > deadline) throw new Error(`SSE timeout waiting for ${needle}`);
          const { value, done } = await reader.read();
          if (done) throw new Error("SSE stream ended");
          text += decoder.decode(value, { stream: true });
        }
      };

      await readUntil("event: ready");
      expect(text).toContain("retry: 3000");
      expect(streamBus.listenerCount).toBe(1);

      const author = await reporterUser(app);
      const article = await publishArticle(author);
      await readUntil(`"id":"${article.id}"`);
      expect(text).toMatch(new RegExp(`event: article\\.published\\ndata: \\{"id":"${article.id}"`));

      await reader.cancel();
      await waitFor(() => streamBus.listenerCount === 0, 5_000, "SSE listener cleanup");
    } finally {
      await streamBus.stop();
    }
  });
});
