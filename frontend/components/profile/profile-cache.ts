import type { InfiniteData } from "@tanstack/react-query";
import type { ArticleCard, ArticleStats, Page, ProfileData } from "@/lib/shared/contracts";

/**
 * Pure helpers for the profile's TanStack Query caches (grids are cursor-paginated
 * `InfiniteData<Page<T>>`). Used by realtime handlers to prepend, patch and remove items.
 */

export type Pages<T> = InfiniteData<Page<T>, string | null>;

type WithId = { id: string };
/** Any loaded infinite-query data (page params are irrelevant for reads). */
type PagesLike<T> = { pages: Page<T>[] };

/** Wraps a server-rendered first page as infinite-query initial data. */
export function toPages<T>(page: Page<T>): Pages<T> {
  return { pages: [page], pageParams: [null] };
}

/** All loaded items in order, de-duplicated by id (a realtime insert can later reappear in a fetched page). */
export function flattenPages<T extends WithId>(data: PagesLike<T> | undefined): T[] {
  if (!data) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

export function hasItem<T extends WithId>(data: PagesLike<T> | undefined, id: string): boolean {
  return Boolean(data?.pages.some((page) => page.items.some((item) => item.id === id)));
}

/** Puts `item` at the very top (no-op when it is already loaded). */
export function prependItem<T extends WithId>(data: Pages<T> | undefined, item: T): Pages<T> | undefined {
  if (!data || hasItem(data, item.id)) return data;
  const [first, ...rest] = data.pages;
  if (!first) return { pages: [{ items: [item], nextCursor: null }], pageParams: [null] };
  return { ...data, pages: [{ ...first, items: [item, ...first.items] }, ...rest] };
}

export function removeItem<T extends WithId>(data: Pages<T> | undefined, id: string): Pages<T> | undefined {
  if (!data || !hasItem(data, id)) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })) };
}

/** Applies live view/like/share counts to a loaded article. */
export function patchStats(data: Pages<ArticleCard> | undefined, stats: ArticleStats): Pages<ArticleCard> | undefined {
  if (!data || !hasItem(data, stats.id)) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === stats.id
          ? { ...item, viewCount: stats.viewCount, likeCount: stats.likeCount, shareCount: stats.shareCount }
          : item,
      ),
    })),
  };
}

/** Adjusts the profile's published-article count by `delta` (never below 0). */
export function bumpArticleCount(profile: ProfileData | undefined, delta: number): ProfileData | undefined {
  if (!profile) return profile;
  return { ...profile, counts: { ...profile.counts, articles: Math.max(0, profile.counts.articles + delta) } };
}
