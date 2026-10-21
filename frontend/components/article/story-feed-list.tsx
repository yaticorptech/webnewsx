"use client";

import { StoryTileSkeleton } from "@/components/feed/desktop-feed";
import { FrontPage } from "@/components/feed/front-page";
import { PhoneStoryCard, PhoneStoryCardSkeleton } from "@/components/feed/phone-story-card";
import { ReelCard, ReelSkeleton } from "@/components/feed/reel-card";
import { useFeedLayout } from "@/components/providers/feed-layout-provider";
import { usePhoneLayout } from "@/components/providers/phone-layout-provider";
import type { ArticleCard } from "@/lib/shared/contracts";

/**
 * The stories under a story (the publisher's, then everyone's) in the layout the reader picked with the grid / reels
 * switch (owner 2026-10-15: "if they came from grid, continue in grid; from reels, in reels") — on the site and in the
 * app:
 *  - reels: the full-screen reels, one per swipe (the section sets `data-reel-proximity` for the snapping);
 *  - grid on phones: the Home feed's posts;
 *  - grid on tablets and computers: Home's YouTube-style grid (rows of cards, a row of reels between).
 */
export function useStoryListIsReels(): boolean {
  return useFeedLayout().layout === "reel";
}

export function StoryFeedList({ stories, ended }: { stories: ArticleCard[]; ended: boolean }) {
  const reels = useStoryListIsReels();
  const phone = usePhoneLayout();
  if (reels) {
    return (
      <ol className="flex flex-col">
        {stories.map((story) => (
          <li key={story.id} data-feed-item={story.id} className="pb-(--reel-gap)">
            <ReelCard article={story} />
          </li>
        ))}
      </ol>
    );
  }
  if (phone) {
    return (
      <ol className="-mx-4 flex flex-col divide-y divide-border">
        {stories.map((story) => (
          <li key={story.id} data-feed-item={story.id} className="min-w-0 scroll-mt-nav pt-1.5">
            <PhoneStoryCard article={story} />
          </li>
        ))}
      </ol>
    );
  }
  // Computers and tablets: the same YouTube-style grid as Home — rows of cards with a row of reels between
  // (owner 2026-10-16: "came from the grid, keep scrolling in that same grid").
  return <FrontPage items={stories} justIn={NONE} loadingMore={false} ended={ended} />;
}

const NONE: ReadonlySet<string> = new Set();

/** "Loading more stories" in the same layout. */
export function StoryFeedLoading() {
  const reels = useStoryListIsReels();
  const phone = usePhoneLayout();
  if (reels) return <ReelSkeleton label="Loading more stories" />;
  if (phone) {
    return (
      <div role="status" aria-label="Loading more stories">
        <PhoneStoryCardSkeleton />
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading more stories" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <StoryTileSkeleton key={i} />
      ))}
    </div>
  );
}
