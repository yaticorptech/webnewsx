"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, useRef } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { UserHandle, handleText } from "@/components/brand/user-handle";
import { FollowButton } from "@/components/follow/follow-button";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { isFresh } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import type { ArticleCard } from "@/lib/shared/contracts";
import { storyHref, storyLinkProps } from "@/lib/story-link";
import { cn } from "@/lib/utils";
import { CategoryChip } from "./category-chip";
import { CommentButton } from "./comment-button";
import { LikeButton } from "./like-button";
import { useArticleStats } from "./live-state";
import { hasIndicScript, INDIC_HEADLINE } from "./script";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import { ReportButton } from "./report-button";
import { ReporterMark, reporterMarkText, StoryLabels } from "./story-badges";
import { StoryCover } from "./story-cover";
import { StoryMenu } from "./story-menu";
import { useLike } from "./use-like";
import { useSave } from "./use-save";
import { ViewCount } from "./view-count";
import { useViewTracking } from "./view-tracker";

export type StoryCardProps = {
  article: ArticleCard;
  /** Composer preview: no navigation and no like/follow/share/view side effects (controls render inert). */
  preview?: boolean;
  /** Eager, high-priority cover (first card above the fold). */
  priority?: boolean;
  /** Just arrived in realtime: red flash + "Just in". */
  highlight?: boolean;
};

/**
 * Feed story (SPEC §3.3): meta row · 16:9 sliced cover (double-tap to like) with the transparency
 * labels (Editor's Pick / Spotlight, SPEC §3.11) · wide headline · 3-line excerpt · byline footer
 * with the press mark (Verified badge / Trainee chip), Follow and live views / likes / shares, plus
 * Save and the ⋯ menu (Report · or, on your own story, Spotlight + Newsroom).
 */
export function StoryCard({ article, preview = false, priority = false, highlight = false }: StoryCardProps) {
  const viewer = useViewer();
  const now = useNow();
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const live = !preview;
  const stats = useArticleStats(article, live);
  const like = useLike(article, live);
  const save = useSave(article, live);
  const isOwn = article.viewer.isAuthor || (viewer !== null && viewer.id === article.author.id);
  useViewTracking(ref, article.id, live && !isOwn);

  const target = storyHref(article);
  const { href } = target;
  const linkProps = storyLinkProps(article);
  const profileHref = `/${article.author.username}`;
  const fresh = now !== null && isFresh(article.publishedAt, undefined, now);
  const level = article.badges?.reporterLevel ?? null;

  const title = preview ? (
    <span>{article.title}</span>
  ) : (
    <Link {...linkProps} className="rounded-sm outline-offset-4 transition-colors duration-200 hover:text-brand">
      {article.title}
    </Link>
  );

  // Phones show only the handle (bold); larger screens the name over the handle. The press mark
  // follows the first visible line.
  const author = (
    <>
      <Avatar src={article.author.image} name={article.author.name} size={36} decorative />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="hidden truncate text-sm font-bold leading-tight text-ink transition-colors group-hover/author:text-brand sm:block">
            {article.author.name}
          </span>
          <UserHandle username={article.author.username} truncate className="text-[0.8125rem] font-bold leading-tight text-ink sm:hidden" />
          {/* Inside the author link, whose accessible name already says "verified reporter": no extra tab stop. */}
          <ReporterMark level={level} size={16} focusable={false} />
        </span>
        <UserHandle
          username={article.author.username}
          truncate
          className="hidden text-[0.8125rem] font-semibold leading-tight text-muted sm:mt-0.5 sm:flex"
        />
      </span>
    </>
  );

  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      data-story-id={article.id}
      className="card relative isolate p-4 transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-md sm:p-5"
    >
      {/* Realtime arrival: a pink flash behind the content (keeps the card's own background and shadow). */}
      {highlight && <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-2xl animate-flash-highlight" />}
      <div className="mb-3 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.75rem] font-semibold text-muted">
        {highlight && (
          <span className="kicker inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand pl-2 pr-2.5 text-brand-contrast">
            <PulseDot size="xs" tone="white" />
            Just in
          </span>
        )}
        {!highlight && (
          <>
            {fresh && <PulseDot size="xs" label="Published in the last hour" />}
            <TimeAgo date={article.publishedAt} className={cn("shrink-0 whitespace-nowrap font-bold", fresh ? "text-brand" : "text-ink-2")} />
          </>
        )}
        {/* The section only, never the district (owner 2026-10-09). */}
        {article.category && <CategoryChip category={article.category} inert={preview} />}
      </div>

      <div className="relative">
        <StoryCover
          src={article.coverUrl}
          blur={article.coverBlur}
          width={article.coverWidth}
          height={article.coverHeight}
          href={preview ? undefined : href}
          external={target.external}
          gate={target.gate}
          onDoubleActivate={preview ? undefined : like.like}
          priority={priority}
          video={article.video}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-1.5">
          <StoryLabels badges={article.badges} hidden={article.hidden} pillClassName="shadow-[0_2px_10px_-2px_rgb(22_24_29/0.35)]" />
        </div>
      </div>

      <h2
        id={titleId}
        // Any language: Urdu / Sindhi / Kashmiri text reads right-to-left.
        dir="auto"
        className={cn(
          "mt-4 line-clamp-3 font-wide text-headline font-extrabold text-balance text-ink",
          hasIndicScript(article.title) && INDIC_HEADLINE,
        )}
      >
        {title}
      </h2>

      {article.excerpt && (
        <p dir="auto" className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          {article.excerpt}
        </p>
      )}

      {preview ? (
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand">
          Continue reading
          <ArrowRight aria-hidden className="size-4" />
        </span>
      ) : (
        <Link
          {...linkProps}
          className="group/more mt-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-bold text-brand outline-offset-4 transition-colors hover:text-brand-hover"
        >
          Continue reading
          <span className="sr-only">: {article.title}</span>
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-200 ease-snap group-hover/more:translate-x-1 motion-reduce:transition-none"
          />
        </Link>
      )}

      <div aria-hidden className="rule-speed mt-4 text-brand">
        <SpeedBarsSvg className="h-2 w-auto" />
      </div>

      <footer className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Phones: when the handle + press mark and Follow don't fit on one line (≈320px), Follow drops to its own
            line instead of squeezing the publisher's name to a few letters. */}
        <div className="flex min-w-0 flex-1 items-center gap-x-3 gap-y-2 max-sm:flex-wrap">
          {preview ? (
            <span className="flex min-w-0 items-center gap-3">{author}</span>
          ) : (
            <Link
              href={profileHref}
              aria-label={`${article.author.name} (${handleText(article.author.username)})${reporterMarkText(level)}`}
              className="group/author flex min-w-0 items-center gap-3 rounded-md outline-offset-2"
            >
              {author}
            </Link>
          )}
          {!isOwn && (
            <div className="ml-auto shrink-0 sm:ml-1" inert={preview || undefined}>
              <FollowButton username={article.author.username} initialFollowing={article.viewer.followingAuthor} size="sm" />
            </div>
          )}
        </div>

        <div
          className="-mx-2.5 flex items-center justify-between sm:mx-0 sm:-mr-2.5 sm:justify-end sm:gap-1"
          inert={preview || undefined}
        >
          <ViewCount count={stats.viewCount} />
          <div className="flex items-center gap-0.5 sm:gap-1">
            <LikeButton like={like} count={stats.likeCount} />
            <CommentButton article={article} count={stats.commentCount} inert={preview} />
            <ShareButton article={article} count={stats.shareCount} inert={preview} />
            <SaveButton save={save} />
            {!preview && !isOwn && <ReportButton article={article} />}
            {!preview && <StoryMenu article={article} />}
          </div>
        </div>
      </footer>
    </article>
  );
}
