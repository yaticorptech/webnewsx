"use client";

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { qk } from "@/lib/query-keys";
import type { ArticleCard, ArticleStats, Page } from "@/lib/shared/contracts";

/*
 * Client-side live state shared by every card / article view (TanStack Query cache):
 *  - stats per article (views · likes · shares), updated by `article.stats` events and by the
 *    viewer's own likes/shares — so a count changes everywhere the story is on screen;
 *  - "viewer liked this" per article + viewer (`qk.likeState` + viewer id, value: boolean);
 *  - each feed's infinite query data (`qk.feed(viewId)` + viewer id; see feed-views.ts), and the publisher reels under
 *    stories (`qk.publisherReel`, same prefix and shape, so the helpers below cover them too).
 * Keys carry the viewer id so a login/logout never shows another session's state.
 */

export type StatCounts = Omit<ArticleStats, "id">;
type StatsSource = Pick<ArticleCard, "id" | "viewCount" | "likeCount" | "shareCount" | "commentCount">;

const LONG_GC = 30 * 60_000;

export const statsKey = (articleId: string) => ["article-stats", articleId] as const;
export const likeKey = (articleId: string, viewerId: string | null) => [...qk.likeState(articleId), viewerId ?? "anon"] as const;
export const feedKey = (viewId: string, viewerId: string | null) => [...qk.feed(viewId), viewerId ?? "anon"] as const;

export type FeedData = InfiniteData<Page<ArticleCard>, unknown>;

export function statsOf(source: StatsSource): StatCounts {
  return { viewCount: source.viewCount, likeCount: source.likeCount, shareCount: source.shareCount, commentCount: source.commentCount };
}

/** Overwrite cached counts with fresh server data (a feed page, a refetch). */
export function seedStats(queryClient: QueryClient, cards: readonly StatsSource[]): void {
  for (const card of cards) queryClient.setQueryData<StatCounts>(statsKey(card.id), statsOf(card));
}

export function setStats(queryClient: QueryClient, articleId: string, update: Partial<StatCounts>): void {
  queryClient.setQueryData<StatCounts>(statsKey(articleId), (prev) => (prev ? { ...prev, ...update } : undefined));
}

/**
 * Live counts for one article: seeded from the server data, then kept current by realtime
 * `article.stats` events (every mounted card listens for its own id) and local actions.
 * `live: false` (composer preview) returns the given counts untouched.
 */
export function useArticleStats(source: StatsSource, live = true): StatCounts {
  const queryClient = useQueryClient();
  const seed = statsOf(source);
  const { data } = useQuery({
    queryKey: statsKey(source.id),
    queryFn: () => queryClient.getQueryData<StatCounts>(statsKey(source.id)) ?? seed,
    initialData: seed,
    staleTime: Infinity,
    gcTime: LONG_GC,
    enabled: live,
  });

  useRealtimeEvent("article.stats", (stats) => {
    if (!live || stats.id !== source.id) return;
    queryClient.setQueryData<StatCounts>(statsKey(source.id), statsOf(stats));
  });

  return live ? (data ?? seed) : seed;
}

/* ─────────────────────────── Feed cache helpers ─────────────────────────── */

export function feedItems(data: FeedData | undefined): ArticleCard[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: ArticleCard[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export function feedHas(data: FeedData | undefined, id: string): boolean {
  return Boolean(data?.pages.some((page) => page.items.some((item) => item.id === id)));
}

/** Prepends cards (newest first) to the first page, skipping ones already present. */
export function prependToFeed(data: FeedData | undefined, cards: readonly ArticleCard[]): FeedData | undefined {
  if (!data || data.pages.length === 0) return data;
  const fresh = cards.filter((card) => !feedHas(data, card.id));
  if (fresh.length === 0) return data;
  const [first, ...rest] = data.pages;
  return { ...data, pages: [{ ...first!, items: [...fresh, ...first!.items] }, ...rest] };
}

export function removeFromFeed(data: FeedData | undefined, ids: ReadonlySet<string>): FeedData | undefined {
  if (!data || !data.pages.some((page) => page.items.some((item) => ids.has(item.id)))) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => !ids.has(item.id)) })) };
}

/** Updates one story's fields in every cached feed (publisher reels included) it appears in (e.g. after its category changed). */
export function patchInAllFeeds(queryClient: QueryClient, id: string, patch: Partial<ArticleCard>): void {
  queryClient.setQueriesData<FeedData>({ queryKey: qk.feedAll }, (data) => {
    if (!data || !data.pages.some((page) => page.items.some((item) => item.id === id))) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })) };
  });
}

/** Removes a story from every cached feed and publisher reel (deleted live, or by its owner). */
export function removeFromAllFeeds(queryClient: QueryClient, id: string): void {
  const ids = new Set([id]);
  queryClient.setQueriesData<FeedData>({ queryKey: qk.feedAll }, (data) => removeFromFeed(data, ids));
}
