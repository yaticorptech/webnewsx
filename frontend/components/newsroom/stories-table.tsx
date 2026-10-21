"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ChartNoAxesColumn, FileText, MessageSquareQuote, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { compactNumber, formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { NewsroomStory, Page } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChartCard } from "./audience-charts";
import { formatPercent, isOpenOrder, spotlightEligible, spotlightState } from "./format";
import type { SpotlightStory } from "./spotlight-sheet";
import { SpotlightStatusChip } from "./spotlight-status";
import { EditorsPickChip, StoryStatusChip } from "./story-status";

/** The Newsroom's paged story list (shared by the table and the Spotlight story picker). */
export function useNewsroomStories(initialPage: Page<NewsroomStory>) {
  return useInfiniteQuery({
    queryKey: qk.newsroomStories,
    queryFn: ({ pageParam, signal }) => api.newsroom.stories(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialPage], pageParams: [null] },
    staleTime: 30_000,
  });
}

export type StoriesTableProps = {
  query: ReturnType<typeof useNewsroomStories>;
  onSpotlight: (story: SpotlightStory) => void;
};

export function storyHref(story: NewsroomStory): string {
  if ((story.status === "published" || story.status === "hidden") && story.slug) return `/a/${story.slug}`;
  return `/publish/${story.id}`;
}

export function toSpotlightStory(story: NewsroomStory): SpotlightStory {
  return { id: story.id, title: story.title, coverUrl: story.coverUrl, coverBlur: story.coverBlur, publishedAt: story.publishedAt };
}

/** Can the reporter start a new Spotlight on this story right now? */
export function canBoost(story: NewsroomStory): boolean {
  return story.status === "published" && spotlightEligible(story.publishedAt) && !(story.spotlight && isOpenOrder(story.spotlight));
}

/**
 * Per-story performance (SPEC §3.11): every published / hidden / in-review / returned story with views,
 * reads, likes, shares and engagement rate, its status and Spotlight state (or a "Spotlight" button).
 * A table from 640px, stacked cards on phones. Paged with "Load more".
 */
export function StoriesTable({ query, onSpotlight }: StoriesTableProps) {
  const stories = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ChartCard
      headingId="newsroom-stories"
      title="Your stories"
      icon={<FileText aria-hidden />}
      description="Lifetime numbers per story, newest activity first."
      aside={
        <Button href="/publish" size="sm" variant="secondary" leftIcon={<Plus aria-hidden />}>
          New story
        </Button>
      }
      className="[&>div]:px-0 [&>div]:pb-0 [&>div]:pt-0"
    >
      {stories.length === 0 ? (
        <EmptyState
          size="sm"
          as="h3"
          title="No stories yet"
          description="Publish your first story and its numbers show up here."
          action={
            <Button href="/publish" size="sm" leftIcon={<Plus aria-hidden />}>
              Write a story
            </Button>
          }
        />
      ) : (
        <>
          {/* ≥640px: table */}
          <table className="hidden w-full border-collapse text-left sm:table">
            <caption className="sr-only">Your stories with views, reads, likes, shares and engagement rate</caption>
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
                <th scope="col" className="py-2.5 pl-5 pr-2 font-bold sm:pl-6">
                  Story
                </th>
                {["Views", "Reads", "Likes", "Shares", "Eng."].map((col) => (
                  <th key={col} scope="col" className="px-2 py-2.5 text-right font-bold last:pr-5 sm:last:pr-6" title={col === "Eng." ? "Engagement rate: (likes + shares) ÷ views" : undefined}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stories.map((story) => (
                <tr key={story.id} data-newsroom-story={story.id} className="border-b border-border align-top transition-colors last:border-b-0 hover:bg-tint/60">
                  <th scope="row" className="py-3.5 pl-5 pr-2 font-normal sm:pl-6">
                    <StoryCell story={story} onSpotlight={onSpotlight} />
                  </th>
                  <Num value={story.viewCount} />
                  <Num value={story.readCount} />
                  <Num value={story.likeCount} />
                  <Num value={story.shareCount} />
                  <td className="px-2 py-3.5 pr-5 text-right text-[0.8125rem] font-bold tabular-nums text-ink sm:pr-6">
                    {formatPercent(story.engagementRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* <640px: cards */}
          <ul className="divide-y divide-border sm:hidden">
            {stories.map((story) => (
              <li key={story.id} data-newsroom-story={story.id} className="px-4 py-4">
                <StoryCell story={story} onSpotlight={onSpotlight} />
                <dl className="mt-3 grid grid-cols-5 gap-1 rounded-xl bg-surface-2 px-2 py-2 text-center">
                  <Stat label="Views" value={story.viewCount} />
                  <Stat label="Reads" value={story.readCount} />
                  <Stat label="Likes" value={story.likeCount} />
                  <Stat label="Shares" value={story.shareCount} />
                  <div>
                    <dt className="text-[0.625rem] font-bold uppercase tracking-[0.06em] text-muted">Eng.</dt>
                    <dd className="mt-0.5 text-[0.8125rem] font-extrabold tabular-nums text-ink">{formatPercent(story.engagementRate)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="flex justify-center border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more stories
              </Button>
            </div>
          )}
        </>
      )}
    </ChartCard>
  );
}

function Num({ value }: { value: number }) {
  return (
    <td className="px-2 py-3.5 text-right text-[0.8125rem] font-bold tabular-nums text-ink" title={formatNumber(value)}>
      {compactNumber(value)}
    </td>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[0.8125rem] font-extrabold tabular-nums text-ink" title={formatNumber(value)}>
        {compactNumber(value)}
      </dd>
    </div>
  );
}

function StoryCell({ story, onSpotlight }: { story: NewsroomStory; onSpotlight: (story: SpotlightStory) => void }) {
  const note: ReactNode = story.status === "returned" ? story.reviewNote : story.status === "hidden" ? story.hiddenReason : null;
  const spotlight = story.spotlight;
  const boost = canBoost(story);
  return (
    <div className="flex min-w-0 gap-3">
      <Link
        href={storyHref(story)}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-video w-18 shrink-0 self-start overflow-hidden rounded-md bg-surface-2 bg-cover bg-center sm:w-20"
        style={story.coverBlur ? { backgroundImage: `url("${story.coverBlur}")` } : undefined}
      >
        {story.coverUrl && (
          <img src={story.coverUrl} alt="" width={160} height={90} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={storyHref(story)}
          className="line-clamp-2 rounded-sm text-sm font-bold leading-snug text-ink transition-colors hover:text-brand"
        >
          {story.title || "Untitled story"}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StoryStatusChip status={story.status} />
          {story.editorsPick && <EditorsPickChip />}
          {spotlight && (spotlight.active || spotlight.status === "pending" || !boost) && (
            <button
              type="button"
              onClick={() => onSpotlight(toSpotlightStory(story))}
              className="rounded-full"
              aria-label={`Spotlight status for “${story.title ?? "Untitled story"}”`}
            >
              <SpotlightStatusChip state={spotlightState(spotlight)} />
            </button>
          )}
          {boost && (
            <button
              type="button"
              data-spotlight-button
              onClick={() => onSpotlight(toSpotlightStory(story))}
              className="inline-flex h-5.5 items-center gap-1 rounded-full bg-surface px-2 text-[0.6875rem] font-bold text-brand ring-1 ring-tint-border ring-inset transition-colors hover:bg-brand hover:text-brand-contrast [&_svg]:size-3"
            >
              <Sparkles aria-hidden />
              Spotlight
              <span className="sr-only">: boost “{story.title ?? "Untitled story"}”</span>
            </button>
          )}
          {/* Every button readers pressed, the funnel and more (owner 2026-10-16, like Meta Ads). */}
          {story.publishedAt && (story.status === "published" || story.status === "hidden") && (
            <Link
              href={`/newsroom/insights/${story.id}`}
              className="inline-flex h-5.5 items-center gap-1 rounded-full bg-surface px-2 text-[0.6875rem] font-bold text-ink-2 ring-1 ring-border-strong ring-inset transition-colors hover:text-brand hover:ring-brand [&_svg]:size-3"
            >
              <ChartNoAxesColumn aria-hidden />
              Insights
            </Link>
          )}
          <span className="text-[0.6875rem] font-semibold text-muted">
            {story.publishedAt ? (
              <TimeAgo date={story.publishedAt} />
            ) : story.submittedAt ? (
              <>
                Sent <TimeAgo date={story.submittedAt} />
              </>
            ) : (
              <>
                Edited <TimeAgo date={story.updatedAt} />
              </>
            )}
          </span>
        </div>
        {note && (
          <p className={cn("mt-2 flex items-start gap-1.5 text-xs leading-relaxed", story.status === "returned" ? "text-ink-2" : "text-muted")}>
            <MessageSquareQuote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              <span className="font-bold text-ink">{story.status === "returned" ? "Review Desk: " : "Editor Desk: "}</span>
              {note}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
