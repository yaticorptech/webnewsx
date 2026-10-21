"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { FREE_CARDS } from "@/components/auth/read-wall";
import { feedItems, removeFromFeed, seedStats, type FeedData } from "@/components/feed/live-state";
import { useOneReelPerSwipe, useSnapFreeScrollToTop } from "@/components/feed/reel-scroll";
import { StoryFeedList, StoryFeedLoading, useStoryListIsReels } from "./story-feed-list";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ArticleCard } from "@/lib/shared/contracts";
import { MoreFromAuthorEnd, MoreFromAuthorHeading, moreFromHeadingId } from "./more-from-author";
import { useStoryReelsRadio } from "./story-reels-radio";

export type PublisherReelProps = {
  username: string;
  /** The story being read: never repeated under itself. */
  excludeId: string;
  /** Server-rendered first stories (the page's `moreFromAuthor`, newest first), shown until the full list loads. */
  initialStories: ArticleCard[];
};

/** Start loading the publisher's stories when the section is within ~1.5 screens. */
const PRELOAD_MARGIN = "0px 0px 150% 0px";

/**
 * "More from @publisher" under a story (owner 2026-09-26): the publisher's other stories as reels — the same ReelCard
 * and "Read full article" tap popup as the feed, no auto-scroll. The server's 3 newest render first (SSR); once the
 * section nears the screen the client takes over with the first page of the publisher's stories
 * (`GET /api/users/:username/articles`), the current story left out. No infinite scroll: when the publisher has more,
 * the list ends with a link to their profile (MoreFromAuthorEnd), so the site footer below stays reachable. <html>
 * snaps these reels with PROXIMITY only (`data-reel-proximity`, globals.css "Reel feed"), so reading the story above is
 * never pulled around, and the phone masthead stays put once they're reached (NavFrame). The list is cached under the
 * feed prefix (`qk.publisherReel`), so deletions, category changes and new publishes reach it like any feed; stories
 * deleted live disappear.
 */
export function PublisherReel({ username, excludeId, initialStories }: PublisherReelProps) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const key = [...qk.publisherReel(username), viewer?.id ?? "anon"] as const;
  const headingId = moreFromHeadingId(username);
  const reels = useStoryListIsReels();
  // Reels only (they do nothing without reels on the page): snapping, one reel per swipe on phones.
  useSnapFreeScrollToTop();
  useOneReelPerSwipe("story");

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.userArticles(username, pageParam, signal);
      seedStats(queryClient, page.items);
      return page;
    },
    initialPageParam: null as string | null,
    // Only the first page is ever fetched; its cursor just tells whether the profile has more (the end panel).
    getNextPageParam: (last) => last.nextCursor,
    enabled: near,
    staleTime: 60_000,
  });
  const { data, hasNextPage, refetch, isError, error } = query;

  useRealtimeEvent("article.deleted", ({ id }) => {
    setGone((prev) => new Set(prev).add(id));
    queryClient.setQueryData<FeedData>(key, (prev) => removeFromFeed(prev, new Set([id])));
  });

  const all = (data ? feedItems(data) : initialStories).filter((story) => story.id !== excludeId && !gone.has(story.id));
  // Logged out (owner 2026-10-08): the first FREE_CARDS only.
  const gated = useMetered();
  const stories = gated ? all.slice(0, FREE_CARDS) : all;
  useStoryReelsRadio("publisher", stories);
  if (initialStories.length === 0 || stories.length === 0) return null;

  const loading = near && data === undefined && !isError;
  // A failed background refetch keeps the cached list: only a list that never loaded offers a retry.
  const loadError = isError && data === undefined;

  return (
    <section ref={sectionRef} aria-labelledby={headingId} data-reel-proximity={reels ? "" : undefined} className="mt-8 sm:mt-14">
      <MoreFromAuthorHeading username={username} id={headingId} className="mb-3 sm:mb-5" />
      {/* In the layout the reader picked: reels, or the Home grid (owner 2026-10-15). */}
      <StoryFeedList stories={stories} ended={!hasNextPage} />

      {loading && <StoryFeedLoading />}

      {loadError && (
        <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="font-wide text-base font-extrabold text-ink">Couldn&apos;t load more stories</p>
          <p className="text-sm text-muted">{errorMessage(error)}</p>
          <Button variant="outline" leftIcon={<RotateCcw aria-hidden />} onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data !== undefined && hasNextPage && !gated && <MoreFromAuthorEnd username={username} />}
    </section>
  );
}
