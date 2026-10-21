"use client";

import { Bookmark, BookmarkCheck, Flag, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type MouseEvent } from "react";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { StoryPoster, toPosterStory } from "@/components/poster/story-poster";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { compactNumber } from "@/lib/format";
import { showAppUpdateForSpeech, useSpeechNeedsAppUpdate } from "@/lib/speech";
import type { ArticleCard } from "@/lib/shared/contracts";
import { openStoryHref, storyHref, storyLinkProps } from "@/lib/story-link";
import { cn } from "@/lib/utils";
import { CommentButton } from "./comment-button";
import { FlagDialog, useReportedReason } from "./flag-dialog";
import { LikeButton } from "./like-button";
import { useArticleStats } from "./live-state";
import { SoundBars, useNewsRadio } from "./news-radio";
import { FollowBadge } from "./reel-controls";
import { ShareButton } from "./share-button";
import { StoryLabels } from "./story-badges";
import { StoryMenu } from "./story-menu";
import { useLike } from "./use-like";
import { useSave } from "./use-save";
import { useViewTracking } from "./view-tracker";

/** The byline row's counted buttons (like, comment, share): compact so the row fits a phone. */
const COUNTED = "h-8 gap-0.5 px-1 text-xs [&_svg]:size-[1.05rem] after:-inset-1 min-[400px]:gap-1 min-[400px]:px-1.5";

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type NewsCardProps = {
  article: ArticleCard;
  /** Eager image (the first cards on screen). */
  priority?: boolean;
  /** Arrived live a moment ago: "Just in" on the image. */
  justIn?: boolean;
};

/**
 * A story in Home's grid (owner 2026-10-05: like Search's poster grid): the story's 9:16 poster in its template — the
 * reporter at its bottom left, with the Follow "+" on their photo — then views · time and the same row of actions as
 * before: like · comment · share and the menu (save, report, News radio, and the author's / desk's tools). A tap on
 * the poster opens the story (its author line and Follow keep their own taps); the headline is a real link for keyboards
 * and screen readers.
 */
export function NewsCard({ article, priority = false, justIn = false }: NewsCardProps) {
  const ref = useRef<HTMLElement>(null);
  const router = useRouter();
  const titleId = useId();
  const isOwn = article.viewer.isAuthor;
  useViewTracking(ref, article.id, !isOwn);
  const stats = useArticleStats(article);
  const like = useLike(article);
  const save = useSave(article);
  const authPrompt = useAuthPrompt();
  const reported = useReportedReason(article) !== null;
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagMounted, setFlagMounted] = useState(false);
  const radio = useNewsRadio();
  const needsAppUpdate = useSpeechNeedsAppUpdate();
  const onAir = radio?.onAir?.id === article.id;

  const target = storyHref(article);
  const { href } = target;
  const views = stats.viewCount;
  const story = toPosterStory(article);

  // A tap opens the story at once (owner 2026-10-07: no lag — it used to wait out a double-tap window for a like; the
  // heart is under the poster and on the reels).
  const openStory = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
      window.open(href, "_blank", "noopener");
      return;
    }
    openStoryHref(target, (path) => router.push(path));
  };

  // The menu at the end of the actions (owner 2026-09-30): save, report, News radio — then the author's / the desk's
  // own tools (Spotlight, stats, change category).
  const menu = (
    <StoryMenu
      article={article}
      vertical
      className="shrink-0"
      leadItems={[
        {
          label: save.saved ? "Remove from saved" : "Save for later",
          icon: save.saved ? <BookmarkCheck aria-hidden className="text-brand" /> : <Bookmark aria-hidden />,
          onSelect: save.toggle,
        },
        ...(isOwn
          ? []
          : [
              {
                label: reported ? "Reported" : "Report",
                icon: <Flag aria-hidden className={cn(reported && "fill-brand text-brand")} />,
                disabled: reported,
                onSelect: () => {
                  if (!authPrompt.guard("Log in to report a story")) return;
                  setFlagMounted(true);
                  setFlagOpen(true);
                },
              },
            ]),
        ...(radio || needsAppUpdate
          ? [
              {
                label: onAir ? "Stop News radio" : "News radio",
                icon: <Radio aria-hidden className={cn(onAir && "text-brand")} />,
                onSelect: () => {
                  if (!radio) showAppUpdateForSpeech();
                  else if (onAir) radio.stop();
                  else radio.start(article.id);
                },
              },
            ]
          : []),
      ]}
    />
  );

  return (
    // No overflow clipping on the tile: the menu and tooltips open past its edges (the poster clips itself).
    <article ref={ref} aria-labelledby={titleId} className="group flex min-w-0 flex-col">
      <div
        onClick={openStory}
        onPointerDown={() => !target.external && router.prefetch(href)}
        className="relative cursor-pointer touch-manipulation select-none"
      >
        <div aria-hidden className="transition-transform duration-300 ease-snap group-hover:-translate-y-0.5 motion-reduce:transition-none">
          <StoryPoster
            template={article.template}
            story={{
              ...story,
              videoUrl: null,
              author: {
                ...story.author,
                href: `/${article.author.username}`,
                follow: isOwn ? undefined : (
                  <FollowBadge username={article.author.username} initialFollowing={article.viewer.followingAuthor} onPoster />
                ),
              },
            }}
            priority={priority}
            titleId={titleId}
            // content-visibility: tiles far off screen skip layout and paint (smooth scrolling in long feeds). The byline
            // never shrinks below ~12px text on these small tiles, phones included (owner 2026-10-08: names unreadable —
            // then, at 4px, cut short on every card: 3.5px fits a first name beside Follow).
            className="rounded-[0.875rem] shadow-card ring-1 ring-ink/5 [--byline-floor:3.5px] [content-visibility:auto] group-hover:shadow-pop md:rounded-2xl"
          />
        </div>
        <span className="pointer-events-none absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1.5">
          {justIn && (
            <span className="kicker inline-flex h-6 items-center gap-1.5 rounded-full bg-brand pl-2 pr-2.5 text-brand-contrast shadow-sm">
              <PulseDot size="xs" tone="white" />
              Just in
            </span>
          )}
          <StoryLabels badges={article.badges} hidden={article.hidden} pillClassName="shadow-[0_2px_10px_-2px_rgb(22_24_29/0.35)]" />
          {article.video && (
            <span className="rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">
              {duration(article.video.durationMs)}
            </span>
          )}
        </span>
      </div>

      {/* The headline is on the poster; this link is for keyboards and screen readers. */}
      <h2 className="sr-only">
        <Link {...storyLinkProps(article)}>{article.title}</Link>
      </h2>

      <p className="mt-2.5 flex min-w-0 items-center gap-1 px-0.5 text-xs font-medium text-muted">
        <span className="truncate">
          <span className="tabular-nums">
            {compactNumber(views)} {views === 1 ? "view" : "views"}
          </span>
          <span aria-hidden> · </span>
          <TimeAgo date={article.publishedAt} />
        </span>
        {/* News radio is reading this story (owner 2026-10-01): a red sound-bars button; tap to stop. */}
        {onAir && radio && (
          <button
            type="button"
            onClick={radio.stop}
            aria-label="Stop News radio"
            title="On air · tap to stop"
            className="relative ml-auto inline-flex size-6 shrink-0 animate-fade-up items-center justify-center rounded-full bg-brand text-brand-contrast shadow-sm transition-colors hover:bg-brand-hover after:absolute after:-inset-2 after:content-['']"
          >
            <SoundBars />
          </button>
        )}
      </p>

      {/* Like · comment · share and the menu, as before (owner 2026-10-05: "same as it is now"). */}
      <div className="-mx-1 flex min-w-0 items-center justify-between min-[400px]:-mx-1.5">
        <div className="flex min-w-0 items-center">
          <LikeButton like={like} count={stats.likeCount} className={COUNTED} />
          <CommentButton article={article} count={stats.commentCount} className={COUNTED} />
          {/* The narrowest phones: no room for share on the tile (it's in the story). */}
          <ShareButton article={article} count={stats.shareCount} className={cn(COUNTED, "max-[359px]:hidden")} />
        </div>
        {menu}
      </div>

      {flagMounted && <FlagDialog articleId={article.id} title={article.title} open={flagOpen} onOpenChange={setFlagOpen} />}
    </article>
  );
}

/** A tile-shaped placeholder: the 9:16 poster, the meta line and the actions. */
export function NewsCardSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col">
      <div className="skeleton aspect-9/16 rounded-[0.875rem] md:rounded-2xl" />
      <div className="skeleton mt-2.5 h-3 w-1/2 rounded-sm" />
      <div className="mt-2.5 flex items-center gap-3">
        <div className="skeleton size-5 rounded-full" />
        <div className="skeleton size-5 rounded-full" />
        <div className="skeleton size-5 rounded-full" />
      </div>
    </div>
  );
}
