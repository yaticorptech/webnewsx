"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Eye, Play } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { useViewer } from "@/components/providers/viewer-provider";
import { BlurredCards, splitForVisitor } from "@/components/auth/read-wall";
import { useInfiniteSentinel } from "@/components/profile/use-infinite-sentinel";
import { StoryPoster, toPosterStory } from "@/components/poster/story-poster";
import { SearchCombobox } from "@/components/search/site-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { compactNumber } from "@/lib/format";
import { newShuffleSeed, visitorShuffleSeed } from "@/lib/shuffle";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ArticleCard } from "@/lib/shared/contracts";
import { storyLinkProps } from "@/lib/story-link";
import { cn } from "@/lib/utils";

/**
 * Tiles edge to edge on phones (Instagram's Explore), a small gap in the page column from 640px, then as many ~9rem
 * posters as fit (redesign 2026-10-07: the side menu shares the width on computers).
 */
const GRID = "grid grid-cols-3 gap-0.5 max-sm:-mx-4 sm:gap-2 md:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] md:gap-3";

/**
 * /explore — the phone tab bar's Search (owner 2026-09-30, like Instagram): a search field on top and, under it, stories
 * as a grid of their posters, exactly as they're published (the ranked mix, endless). Tapping the field turns the page
 * into search — people and stories as you type — until Cancel.
 */
export function ExploreView() {
  const [searching, setSearching] = useState(false);
  // A new field (cleared) after Cancel.
  const [round, setRound] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Logged out (owner 2026-10-08 / 2026-10-22, as Home): FREE_CARDS stories of the day's mix open, then BLURRED_CARDS
  // blurred under "Sign in to read", no more pages — one seed all day (lib/shuffle.ts), so a refresh can't swap the
  // blurred stories into view.
  const viewer = useViewer();
  const gated = useMetered();
  const feed = useInfiniteQuery({
    queryKey: [...qk.explore, viewer ? "mix" : "day"],
    // A fresh mix on every visit (owner 2026-10-05), recent stories first; the seed rides in the next pages' cursors.
    queryFn: ({ pageParam, signal }) =>
      api.feed({ tab: "latest", cursor: pageParam, shuffle: pageParam ? null : viewer ? newShuffleSeed() : visitorShuffleSeed() }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });
  // Ranked pages can overlap: each story once.
  const seen = new Set<string>();
  const all = (feed.data?.pages ?? []).flatMap((page) => page.items).filter((story) => !seen.has(story.id) && seen.add(story.id));
  const { free: stories, locked: blurred, complete } = splitForVisitor(all, gated);
  const moreToLoad = Boolean(feed.hasNextPage) && !complete;

  const sentinel = useInfiniteSentinel<HTMLDivElement>({
    enabled: !searching && moreToLoad && !feed.isFetchingNextPage && !feed.isError,
    onReach: () => void feed.fetchNextPage(),
  });

  const cancel = () => {
    setSearching(false);
    setRound((n) => n + 1);
    inputRef.current?.blur();
  };

  return (
    <section aria-label="Search and explore" data-grid-page="" className="flex flex-col gap-4">
      <div role="search">
        <SearchCombobox
          key={round}
          variant="page"
          inputRef={inputRef}
          onFocus={() => setSearching(true)}
          onNavigate={() => setSearching(false)}
          onClose={cancel}
          trailing={
            searching && (
              <button type="button" onClick={cancel} className="shrink-0 text-[0.9375rem] font-bold text-ink hover:text-brand">
                Cancel
              </button>
            )
          }
        />
      </div>

      {searching ? null : feed.isPending ? (
        <div role="status" aria-label="Loading stories" className={GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-9/16 rounded-none sm:rounded-xl" />
          ))}
        </div>
      ) : feed.isError && stories.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-sm text-muted">Couldn&rsquo;t load stories. Check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={() => void feed.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <ul aria-label="Stories" className={GRID}>
            {stories.map((story, index) => (
              <ExploreTile key={story.id} story={story} priority={index < 6} />
            ))}
          </ul>
          {blurred.length > 0 && <BlurredCards articles={blurred} gridClassName={GRID} />}
          <div ref={sentinel} aria-hidden className="h-px" />
          {feed.isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <SpeedLinesLoader size="sm" label="Loading more stories" />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ExploreTile({ story, priority }: { story: ArticleCard; priority: boolean }) {
  return (
    <li>
      <Link
        {...storyLinkProps(story)}
        aria-label={story.title}
        className={cn("group relative block overflow-hidden -outline-offset-2 sm:rounded-xl", "transition-opacity hover:opacity-90")}
      >
        {/* The poster as published; a video story shows its poster frame here, with a play mark. content-visibility:
            tiles far off screen skip layout and paint. */}
        <StoryPoster
          template={story.template}
          story={{ ...toPosterStory(story), videoUrl: null }}
          priority={priority}
          className="[content-visibility:auto]"
        />
        {/* Its views at the bottom left, like Instagram's Reels grid (redesign 2026-10-07). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/4 items-end bg-linear-to-t from-black/55 to-transparent p-1.5 sm:p-2"
        >
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
            {story.video ? <Play className="size-3 fill-current" /> : <Eye className="size-3.5" />}
            {compactNumber(story.viewCount)}
          </span>
        </span>
      </Link>
    </li>
  );
}
