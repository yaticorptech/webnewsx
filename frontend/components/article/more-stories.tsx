"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePhoneLayout } from "@/components/providers/phone-layout-provider";
import { useEffect, useRef, useState } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { BLURRED_CARDS, BlurredFeedCards, BlurredReels, FREE_CARDS } from "@/components/auth/read-wall";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { feedItems, removeFromFeed, seedStats, type FeedData } from "@/components/feed/live-state";
import { StoryFeedList, StoryFeedLoading, useStoryListIsReels } from "./story-feed-list";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useStoryReelsRadio } from "./story-reels-radio";

export type MoreStoriesProps = {
  /** The story being read. */
  excludeId: string;
  /** Its publisher: their stories are in "More from" just above, so they're left out here. */
  authorId: string;
};

/** Start loading when the section is within ~1.5 screens; load the next page ~2 screens before the end. */
const PRELOAD_MARGIN = "0px 0px 150% 0px";
const NEXT_PAGE_MARGIN = "0px 0px 200% 0px";

/**
 * "More stories" under a story (owner 2026-09-28: "don't stop scrolling"): after the publisher's own reels, the latest
 * stories from everyone else as the same reels, loading page after page (`GET /api/feed?tab=latest`) until the feed
 * runs out ("You're all caught up", then the site footer). Snaps by proximity like the publisher reels
 * (`data-reel-proximity`); cached under the feed prefix so deletions and category changes reach it like any feed.
 */
export function MoreStories({ excludeId, authorId }: MoreStoriesProps) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const key = [...qk.feed("article-more"), viewer?.id ?? "anon"] as const;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || near) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: PRELOAD_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.feed({ tab: "latest", cursor: pageParam }, signal);
      seedStats(queryClient, page.items);
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: near,
    staleTime: 60_000,
  });
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage, isError, isFetchNextPageError, error, refetch } = query;
  const all = feedItems(data).filter((story) => story.id !== excludeId && story.author.id !== authorId && !gone.has(story.id));
  // Logged out (owner 2026-10-08, as the feeds): FREE_CARDS reels, then BLURRED_CARDS blurred, no more pages.
  const gated = useMetered();
  const stories = gated ? all.slice(0, FREE_CARDS) : all;
  const blurred = gated ? all.slice(FREE_CARDS, FREE_CARDS + BLURRED_CARDS) : [];
  const moreToLoad = Boolean(hasNextPage) && (!gated || all.length < FREE_CARDS + BLURRED_CARDS);

  // Infinite scroll: the next page loads well before the reader reaches the last reel.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !moreToLoad || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    }, { rootMargin: NEXT_PAGE_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, [moreToLoad, isFetchingNextPage, isFetchNextPageError, fetchNextPage, data]);

  useRealtimeEvent("article.deleted", ({ id }) => {
    setGone((prev) => new Set(prev).add(id));
    queryClient.setQueryData<FeedData>(key, (prev) => removeFromFeed(prev, new Set([id])));
  });

  const loading = near && data === undefined && !isError;
  const loadError = isError && data === undefined;
  const ended = data !== undefined && !moreToLoad;
  // A first page made only of this publisher's stories: fetch on until something else shows up.
  const needMore = data !== undefined && all.length === 0 && moreToLoad && !isFetchingNextPage && !isFetchNextPageError;
  useEffect(() => {
    if (needMore) void fetchNextPage();
  }, [needMore, fetchNextPage]);
  const reels = useStoryListIsReels();
  const phone = usePhoneLayout();
  useStoryReelsRadio("more", stories, moreToLoad, () => {
    if (!isFetchingNextPage) void fetchNextPage();
  });

  if (ended && stories.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="more-stories-heading"
      data-reel-proximity={reels ? "" : undefined}
      className="mt-8 sm:mt-14"
    >
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-border pb-3 sm:mb-5">
        <h2 id="more-stories-heading" className="kicker text-ink">
          More stories
        </h2>
        <Link
          href="/?tab=latest"
          className="group inline-flex items-center gap-1 rounded-sm text-[0.8125rem] font-bold text-brand transition-colors hover:text-brand-hover"
        >
          Latest
          <ArrowRight aria-hidden className="size-3.5 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* In the layout the reader picked: reels, or the Home grid (owner 2026-10-15). */}
      <StoryFeedList stories={stories} ended={!moreToLoad} />
      {/* Visitors past their free stories: locked cards in the same layout. */}
      {blurred.length > 0 && (reels ? <BlurredReels articles={blurred} /> : <BlurredFeedCards articles={blurred} phone={phone} />)}

      {(loading || isFetchingNextPage) && <StoryFeedLoading />}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      {(loadError || isFetchNextPageError) && (
        <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="font-wide text-base font-extrabold text-ink">Couldn&apos;t load more stories</p>
          <p className="text-sm text-muted">{errorMessage(error)}</p>
          <Button
            variant="outline"
            leftIcon={<RotateCcw aria-hidden />}
            onClick={() => void (loadError ? refetch() : fetchNextPage())}
          >
            Try again
          </Button>
        </div>
      )}

      {ended && (
        <div className={cn("panel-tint flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center")}>
          <SpeedBarsSvg className="w-9 text-brand" />
          <p className="kicker text-ink">You&apos;re all caught up</p>
          <p className="max-w-xs text-sm text-muted">New stories appear on the feed the moment they&apos;re published.</p>
          <Button href="/" variant="secondary" size="sm" rightIcon={<ArrowRight aria-hidden />} className="mt-1">
            Go to the feed
          </Button>
        </div>
      )}
    </section>
  );
}
