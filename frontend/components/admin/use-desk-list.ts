"use client";

import { useInfiniteQuery, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Page } from "@/lib/shared/contracts";

type DeskListOptions<T> = {
  queryKey: QueryKey;
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;
  /** Server-rendered first page — only pass it when `queryKey` matches the filters it was loaded with. */
  initial?: Page<T> | null;
};

/** Cursor-paginated desk list (TanStack infinite query) with a flat `items` array. */
export function useDeskList<T>({ queryKey, fetchPage, initial }: DeskListOptions<T>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<T>) => last.nextCursor ?? undefined,
    initialData: initial ? { pages: [initial], pageParams: [null] } : undefined,
    staleTime: 15_000,
    // Another editor may have acted meanwhile: refresh when the desk tab regains focus.
    refetchOnWindowFocus: true,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, items };
}

type Snapshot = [QueryKey, unknown][];

/**
 * Optimistically rewrites matching items in every cached desk list under `prefix`
 * (`update` returns the new item, or null to drop it). Returns a snapshot for `restoreLists`.
 */
export function patchLists<T>(
  client: QueryClient,
  prefix: QueryKey,
  match: (item: T) => boolean,
  update: (item: T) => T | null,
): Snapshot {
  const snapshot = client.getQueriesData({ queryKey: prefix }) as Snapshot;
  for (const [key, data] of snapshot) {
    if (!isInfinitePages<T>(data)) continue;
    client.setQueryData<InfiniteData<Page<T>, string | null>>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((item) => {
          if (!match(item)) return [item];
          const next = update(item);
          return next ? [next] : [];
        }),
      })),
    });
  }
  return snapshot;
}

export function restoreLists(client: QueryClient, snapshot: Snapshot): void {
  for (const [key, data] of snapshot) client.setQueryData(key, data);
}

function isInfinitePages<T>(data: unknown): data is InfiniteData<Page<T>, string | null> {
  return Boolean(data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages));
}
