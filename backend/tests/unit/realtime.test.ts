import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBusEvent } from "../../src/lib/events.js";
import { RealtimeBus, type RealtimeEvent } from "../../src/lib/realtime.js";
import type { ArticleCard, ArticleStats } from "../../src/shared/contracts.js";

const ID = "4f1c1d7e-0000-4000-8000-000000000001";

function card(id: string): ArticleCard {
  return {
    id,
    slug: "a-story-abc123",
    title: "A story",
    excerpt: "Text",
    coverUrl: "/media/covers/u/x.webp",
    coverWidth: 1600,
    coverHeight: 900,
    coverBlur: null,
    linkUrl: null,
    linkDomain: null,
    readingMinutes: 1,
    viewCount: 0,
    likeCount: 0,
    shareCount: 0,
    commentCount: 0,
    publishedAt: new Date().toISOString(),
    author: { id: "u", username: "someone", name: "Someone", image: null },
    viewer: { liked: false, followingAuthor: false, isAuthor: false },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeBus (no database)", () => {
  it("fetches a published card once for all listeners", async () => {
    const fetchCard = vi.fn(async (id: string) => card(id));
    const bus = new RealtimeBus({ databaseUrl: "postgres://unused", fetchCard });
    const received: RealtimeEvent[][] = [[], [], []];
    received.forEach((list) => bus.subscribe((e) => list.push(e)));

    await bus.handle({ t: "article.published", id: ID });
    expect(fetchCard).toHaveBeenCalledTimes(1);
    for (const list of received) {
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe("article.published");
      expect(list[0]?.data).toBe(received[0]?.[0]?.data); // the very same card object
      expect((list[0]?.data as { id: string } | undefined)?.id).toBe(ID);
    }
  });

  it("skips work when nobody listens and forwards deletions", async () => {
    const fetchCard = vi.fn(async (id: string) => card(id));
    const bus = new RealtimeBus({ databaseUrl: "postgres://unused", fetchCard });
    await bus.handle({ t: "article.published", id: ID });
    expect(fetchCard).not.toHaveBeenCalled();

    const events: RealtimeEvent[] = [];
    const unsubscribe = bus.subscribe((e) => events.push(e));
    await bus.handle({ t: "article.deleted", id: ID });
    expect(events).toEqual([{ name: "article.deleted", data: { id: ID } }]);
    unsubscribe();
    expect(bus.listenerCount).toBe(0);
  });

  it("forwards comment changes per story and bell pings per user", async () => {
    const bus = new RealtimeBus({ databaseUrl: "postgres://unused" });
    const events: RealtimeEvent[] = [];
    bus.subscribe((e) => events.push(e));
    await bus.handle({ t: "comments", id: ID });
    await bus.handle({ t: "notify", id: "user-1" });
    expect(events).toEqual([
      { name: "comments.changed", data: { articleId: ID } },
      { name: "notifications.changed", data: { userId: "user-1" } },
    ]);
    expect(parseBusEvent(JSON.stringify({ t: "comments", id: ID }))).toEqual({ t: "comments", id: ID });
  });

  it("coalesces article.stats to at most one event per second per article", async () => {
    vi.useFakeTimers();
    let likes = 0;
    const fetchStats = vi.fn(async (id: string): Promise<ArticleStats> => ({ id, viewCount: 0, likeCount: likes, shareCount: 0, commentCount: 0 }));
    const bus = new RealtimeBus({ databaseUrl: "postgres://unused", fetchStats, statsIntervalMs: 1_000 });
    const events: RealtimeEvent[] = [];
    bus.subscribe((e) => events.push(e));

    likes = 1;
    await bus.handle({ t: "article.stats", id: ID }); // leading edge
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);

    for (let i = 2; i <= 10; i++) {
      likes = i;
      await bus.handle({ t: "article.stats", id: ID });
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(events).toHaveLength(1); // burst held back

    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toHaveLength(2); // one trailing event with the fresh count
    expect(events[1]).toEqual({ name: "article.stats", data: { id: ID, viewCount: 0, likeCount: 10, shareCount: 0, commentCount: 0 } });
    expect(fetchStats).toHaveBeenCalledTimes(2);
  });

  it("closes open streams on stop()", async () => {
    const bus = new RealtimeBus({ databaseUrl: "postgres://unused" });
    const onClose = vi.fn();
    bus.subscribe(() => {}, onClose);
    await bus.stop();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount).toBe(0);
  });
});

describe("parseBusEvent", () => {
  it("accepts the three wire events and rejects anything else", () => {
    expect(parseBusEvent(JSON.stringify({ t: "article.published", id: ID }))).toEqual({ t: "article.published", id: ID });
    expect(parseBusEvent(JSON.stringify({ t: "article.stats", id: ID, extra: 1 }))).toEqual({ t: "article.stats", id: ID });
    expect(parseBusEvent(JSON.stringify({ t: "article.deleted", id: ID }))).toEqual({ t: "article.deleted", id: ID });
    expect(parseBusEvent(JSON.stringify({ t: "user.hacked", id: ID }))).toBeNull();
    expect(parseBusEvent(JSON.stringify({ t: "article.stats" }))).toBeNull();
    expect(parseBusEvent("not json")).toBeNull();
  });
});
