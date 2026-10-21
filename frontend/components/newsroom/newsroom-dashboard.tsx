"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { NoticesPanel } from "@/components/notices/notices";
import { useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { api, browserTimeZone } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  NEWSROOM_RANGES,
  type NewsroomBestTimes,
  type NewsroomRange,
  type NewsroomSeries,
  type NewsroomSpotlight,
  type NewsroomStory,
  type NewsroomSummary,
  type Page,
  type SpotlightOrder,
  type ViewerUser,
} from "@/lib/shared/contracts";
import { Segmented } from "./audience-charts";
import { BestTimes } from "./best-times";
import { CompletePassBanner } from "./newsroom-header";
import { Overview, TopStories } from "./overview";
import { PressPassLink } from "./press-pass-link";
import { SpotlightPanel } from "./spotlight-panel";
import { SpotlightSheet, type SpotlightStory } from "./spotlight-sheet";
import { canBoost, StoriesTable, toSpotlightStory, useNewsroomStories } from "./stories-table";

export type NewsroomInitial = {
  summary: NewsroomSummary;
  series: NewsroomSeries;
  stories: Page<NewsroomStory>;
  bestTimes: NewsroomBestTimes;
  spotlight: NewsroomSpotlight;
};

export type NewsroomDashboardProps = {
  viewer: Pick<ViewerUser, "name" | "username" | "image" | "role" | "reporterLevel" | "pressPass">;
  initial: NewsroomInitial;
  /** Show the Spotlight panel (default true; Settings has Spotlight as its own option, owner 2026-10-12). */
  showSpotlight?: boolean;
};

const noopSubscribe = () => () => {};

/**
 * The browser's time zone once hydrated; the server's (the backend default, used for the SSR data)
 * until then — so day and hour buckets end up in the reporter's own zone without a hydration mismatch.
 */
function useTimeZone(serverZone: string): string {
  return useSyncExternalStore(noopSubscribe, browserTimeZone, () => serverZone);
}

/**
 * Newsroom (SPEC §3.11): header · range filter (7 / 30 / 90 days) scoping the KPI tiles and the two
 * time-series charts · per-story table · best time to publish · Spotlight (packages, history, purchase
 * sheet) · Press Pass card. Server-rendered first, then TanStack Query keeps it fresh; switching the
 * range keeps the previous frame dimmed while the new numbers load.
 */
export function NewsroomDashboard({ viewer, initial, showSpotlight = true }: NewsroomDashboardProps) {
  const [range, setRange] = useState<NewsroomRange>(initial.summary.range);
  const tz = useTimeZone(initial.series.timeZone);

  const summary = useQuery({
    queryKey: qk.newsroomSummary(range),
    queryFn: ({ signal }) => api.newsroom.summary(range, signal),
    initialData: range === initial.summary.range ? initial.summary : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const series = useQuery({
    queryKey: qk.newsroomSeries(range, tz),
    queryFn: ({ signal }) => api.newsroom.series(range, tz, signal),
    initialData: range === initial.series.range && tz === initial.series.timeZone ? initial.series : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const bestTimes = useQuery({
    queryKey: qk.newsroomBestTimes(tz),
    queryFn: ({ signal }) => api.newsroom.bestTimes(tz, signal),
    initialData: tz === initial.bestTimes.timeZone ? initial.bestTimes : undefined,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const spotlight = useQuery({
    queryKey: qk.newsroomSpotlight,
    queryFn: ({ signal }) => api.newsroom.spotlight(signal),
    initialData: initial.spotlight,
    staleTime: 15_000,
  });
  const stories = useNewsroomStories(initial.stories);

  useRealtimeReconnect(() => {
    void summary.refetch();
    void series.refetch();
  });

  const [sheet, setSheet] = useState<{ open: boolean; story: SpotlightStory | null }>({ open: false, story: null });
  const openSheet = (story: SpotlightStory | null) => setSheet({ open: true, story });

  // Boost picker candidates: published stories in the window without an open Spotlight.
  const allStories = stories.data?.pages.flatMap((page) => page.items) ?? initial.stories.items;
  const candidates = allStories.filter(canBoost).map(toSpotlightStory);

  const summaryData = summary.data ?? initial.summary;
  const seriesData = series.data ?? initial.series;
  const pass = summaryData.pressPass ?? viewer.pressPass;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* No banner header (owner 2026-10-12: removed — name, New story, Press Pass). */}
      {pass && !pass.complete && <CompletePassBanner />}
      <NoticesPanel />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-wide text-lg font-black tracking-tight text-ink sm:text-xl">Your numbers</h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted">Last {summaryData.range} days compared with the {summaryData.range} days before</p>
        </div>
        <Segmented
          label="Time range"
          size="md"
          value={String(range)}
          onChange={(value) => setRange(Number(value) as NewsroomRange)}
          options={NEWSROOM_RANGES.map((days) => ({ value: String(days), label: `${days} days` }))}
        />
      </div>

      {/* Analytics-pro (owner 2026-10-14): KPI tabs over one large chart, top stories beside it on wide screens. */}
      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-stretch">
        <Overview summary={summaryData} series={seriesData} dimmed={summary.isPlaceholderData || series.isPlaceholderData} />
        <TopStories stories={allStories} totals={summaryData.totals} />
      </div>

      <StoriesTable query={stories} onSpotlight={openSheet} />

      {/* Spotlight and the best times to publish side by side on wide screens. */}
      <div className={cn("grid gap-5 sm:gap-6 xl:items-start", showSpotlight && "xl:grid-cols-2")}>
        {showSpotlight && (
        <SpotlightPanel
          data={spotlight.data ?? initial.spotlight}
          onBoost={() => openSheet(null)}
          onOpenStory={(order: SpotlightOrder) =>
            openSheet({
              id: order.article.id,
              title: order.article.title,
              coverUrl: order.article.coverUrl,
              publishedAt: allStories.find((story) => story.id === order.article.id)?.publishedAt ?? null,
            })
          }
        />
        )}

        <BestTimes data={bestTimes.data ?? initial.bestTimes} dimmed={bestTimes.isPlaceholderData} />
      </div>

      <PressPassLink pass={pass} viewer={viewer} />

      <SpotlightSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        story={sheet.story}
        candidates={candidates}
        inNewsroom
      />
    </div>
  );
}
