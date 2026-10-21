"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NewsRadioProvider } from "@/components/feed/news-radio";
import type { ArticleCard } from "@/lib/shared/contracts";

type SectionKey = "publisher" | "more";
type Section = { items: readonly ArticleCard[]; hasNextPage: boolean };

const ReportContext = createContext<((key: SectionKey, section: Section) => void) | null>(null);
const LoadMoreContext = createContext<{ current: () => void } | null>(null);

/**
 * News radio for the reels under a story (owner 2026-10-01): one radio over "More from @publisher" then "More stories",
 * so it reads on from one section into the next and loads more stories as it goes, like on the feed.
 */
export function StoryReelsRadio({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Partial<Record<SectionKey, Section>>>({});
  const loadMore = useRef<() => void>(() => {});
  const report = useCallback((key: SectionKey, section: Section) => {
    setSections((prev) => ({ ...prev, [key]: section }));
  }, []);
  const items = useMemo(() => [...(sections.publisher?.items ?? []), ...(sections.more?.items ?? [])], [sections]);

  return (
    <ReportContext.Provider value={report}>
      <LoadMoreContext.Provider value={loadMore}>
        <NewsRadioProvider items={items} hasNextPage={sections.more?.hasNextPage ?? false} loadMore={() => loadMore.current()}>
          {children}
        </NewsRadioProvider>
      </LoadMoreContext.Provider>
    </ReportContext.Provider>
  );
}

/** A section's reels for the radio (re-reported only when the list itself changes); "more" also brings its next page. */
export function useStoryReelsRadio(key: SectionKey, items: readonly ArticleCard[], hasNextPage = false, loadMore?: () => void) {
  const report = useContext(ReportContext);
  const loadMoreRef = useContext(LoadMoreContext);
  const ids = items.map((item) => item.id).join(",");
  const latest = useRef(items);

  useEffect(() => {
    latest.current = items;
  });
  useEffect(() => {
    report?.(key, { items: latest.current, hasNextPage });
  }, [report, key, ids, hasNextPage]);

  useEffect(() => {
    if (loadMoreRef && loadMore) loadMoreRef.current = loadMore;
  });
}
