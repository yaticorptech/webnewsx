"use client";

import { Volume2, VolumeX } from "lucide-react";
import { MotionConfig } from "motion/react";
import Link from "next/link";
import {
  memo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useMeterReel } from "@/components/auth/read-meter";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import {
  StoryPoster,
  toPosterStory,
  type PosterStory,
} from "@/components/poster/story-poster";
import { useViewer } from "@/components/providers/viewer-provider";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { storyHref, storyLinkProps } from "@/lib/story-link";
import { PremiumCorner } from "./premium";
import type { ArticleCard } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { clipLength, setVideoSound, useVideoSound } from "@/lib/video-playback";
import { useArticleStats } from "./live-state";
import { REEL_SECONDS, useReelTarget, useReelTimer } from "./reel-autoscroll";
import { FollowBadge, ReelRail } from "./reel-controls";
import { ReadFullPopup, useReelTap } from "./reel-popup";
import { hasStoryLabels, StoryLabels } from "./story-badges";
import { DOUBLE_TAP_MS, HeartPop } from "./story-cover";
import { useLike } from "./use-like";
import { useSave } from "./use-save";
import { useViewTracking } from "./view-tracker";

export type ReelCardProps = {
  article: ArticleCard;
  /** Eager, high-priority poster photo (the first reel only). */
  priority?: boolean;
  /** Just arrived in realtime: red flash + "Just in". */
  highlight?: boolean;
  /**
   * Composer preview (the publish form's live preview, step 02): the published reel as a phone shows it at any screen
   * width — the poster with the action rail on it, as readers see it (zero counts, the Follow badge) — and fully inert:
   * no taps, popup, likes, live stats, view counting or auto-scroll, not a snap target and not a feed item. Sized by
   * its container instead of the screen: as wide as it, 9:16.
   */
  preview?: boolean;
};

/** Pills on the poster get a soft shadow so they lift off busy images. */
const ON_PHOTO = "shadow-[0_2px_10px_-2px_rgb(22_24_29/0.35)]";

/** Preview: the poster fills the reel's width at every screen size (`.reel-frame` leaves the rail's column ≥640px). */
const PREVIEW_FRAME = { "--reel-poster-w": "100cqw" } as CSSProperties;

/**
 * One story per screen (owner 2026-09-26, "like Instagram reels"): exactly `--reel-h` tall (the space under the sticky
 * masthead; above the tab bar on phones — globals.css "Reel feed"), holding the story's POSTER (its template:
 * WebNEWS logo, photo — a video story's clip, playing muted while on screen —, headline and a small author line), the
 * largest 9:16 box that fits, centred, rounded from 640px. Over the poster: the auto-scroll progress bar along its top,
 * the live "Just in" pill (top-left), the transparency labels and a video's sound switch (top-right); beside it, the action rail
 * (reel-controls.tsx: author + Follow, like, comment, share, save, report, auto-scroll, ⋯).
 *
 * A tap anywhere that isn't a control shows the "Read full article" popup (reel-popup.tsx); a double tap on the poster
 * likes the story (the heart pops). Keyboards and screen readers get the headline as a real link (an invisible layer
 * over the poster, outlined when focused); the poster itself is hidden from them as a visual copy of that headline and
 * the rail's author link. Live stats and view counting (never on your own story) as on StoryCard; memoized: the feed
 * re-renders often. `preview` renders the same reel for the publish form (see ReelCardProps).
 */
export const ReelCard = memo(function ReelCard({
  article,
  priority = false,
  highlight = false,
  preview = false,
}: ReelCardProps) {
  const viewer = useViewer();
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const lastTap = useRef(0);
  const [heart, setHeart] = useState(0);
  const live = !preview;
  const stats = useArticleStats(article, live);
  const like = useLike(article, live);
  const save = useSave(article, live);
  const isOwn =
    article.viewer.isAuthor ||
    (viewer !== null && viewer.id === article.author.id);
  // A preview never attaches `ref` (below), so there is nothing to count as a view or to hand to a feed's auto-scroll.
  useViewTracking(ref, article.id, live && !isOwn);
  // Auto-scroll lets a video story's clip play to its end before moving on.
  useReelTarget(
    ref,
    article.id,
    Math.max(REEL_SECONDS * 1000, article.video?.durationMs ?? 0),
  );
  // Visitors: a reel watched counts as one of their free stories; past them, it brings up the sign-up wall.
  useMeterReel(ref, article.id, live && !isOwn);

  // A Read more link story opens its link (owner 2026-10-15).
  const { href, external, gate } = storyHref(article);
  const onTap = useReelTap(titleId, href);

  // The phone look of the reel below (poster edge to edge, the rail on it), minus everything that reacts or links: no
  // `.reel` / `data-story-id` (snapping, the feed's and auto-scroll's lookups), no tap handlers, popup, progress bar,
  // heart or headline link; `inert` takes the rail's controls out of the tab order and the pointer's reach.
  if (preview) {
    return (
      <article
        aria-labelledby={titleId}
        inert
        style={PREVIEW_FRAME}
        className="reel-frame relative isolate flex items-center justify-center"
      >
        <div className="reel-poster relative rounded-2xl">
          <div className="relative select-none overflow-hidden rounded-[inherit] shadow-pop ring-1 ring-ink/10">
            <div aria-hidden>
              <StoryPoster
                template={article.template}
                story={toPosterStory(article)}
                priority={priority}
                titleId={titleId}
              />
            </div>
            <ReelMarkers article={article} />
          </div>
          <ReelRail
            article={article}
            stats={stats}
            like={like}
            save={save}
            isOwn={isOwn}
            preview
          />
        </div>
      </article>
    );
  }

  // A second tap on the poster within the double-tap window likes the story (the reel's own tap handler then drops
  // the popup the first tap would have opened).
  const onPosterClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    // The poster's author line opens the profile (its photo carries Follow): never half of a double-tap like.
    if (event.target instanceof Element && event.target.closest("a, button"))
      return;
    if (event.timeStamp - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setHeart((n) => n + 1);
      like.like();
      return;
    }
    lastTap.current = event.timeStamp;
  };

  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      data-story-id={article.id}
      onClick={onTap}
      className={cn(
        // touch-manipulation: no double-tap zoom, so taps and double taps on the reel stay ours.
        // Phones too: a rounded card inside the page margins, not edge to edge (owner 2026-09-28).
        "reel reel-frame relative isolate flex h-(--reel-h) touch-manipulation items-center justify-center",
        "rounded-2xl sm:rounded-3xl",
      )}
    >
      {/* Realtime arrival: a pink flash behind the poster. */}
      {highlight && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] animate-flash-highlight"
        />
      )}

      <div
        data-reel-popup-host
        className="reel-poster relative rounded-2xl sm:rounded-3xl"
      >
        <div
          onClick={onPosterClick}
          className="relative cursor-pointer select-none overflow-hidden rounded-[inherit] shadow-pop ring-1 ring-ink/10"
        >
          <div aria-hidden>
            {/* The author line links to their profile (owner 2026-09-29; the tap handlers leave links alone). */}
            {/* content-visibility: reels far off screen skip layout and paint (smooth swiping deep into the feed). */}
            <StoryPoster
              template={article.template}
              story={withAuthorLink(article, !isOwn)}
              priority={priority}
              titleId={titleId}
              className="[content-visibility:auto]"
            />
          </div>
          <ReelProgress reelKey={article.id} />

          <div className="pointer-events-none absolute left-2.5 top-(--reel-badge-top) z-10 flex max-w-[calc(100%-4rem)] flex-col items-start gap-1.5">
            {highlight && (
              <span
                className={cn(
                  "kicker inline-flex h-6 items-center gap-1.5",
                  "whitespace-nowrap rounded-full bg-brand pl-2 pr-2.5 text-brand-contrast",
                  ON_PHOTO,
                )}
              >
                <PulseDot size="xs" tone="white" />
                Just in
              </span>
            )}
          </div>
          <ReelMarkers article={article} />

          {/* Owner rule: the heart pops also under Reduce Motion. */}
          <MotionConfig reducedMotion="never">
            <HeartPop beat={heart} onDone={() => setHeart(0)} />
          </MotionConfig>
        </div>

        {/* The headline as a real link for keyboards and screen readers: over the whole poster but transparent to
            taps (they reach the poster: popup, double-tap like), outlined when focused. */}
        <h2>
          <Link
            {...storyLinkProps(article)}
            className="pointer-events-none absolute inset-0 z-10 rounded-2xl sm:rounded-3xl"
          >
            <span dir="auto" className="sr-only">
              {article.title}
            </span>
          </Link>
        </h2>

        <ReelRail
          article={article}
          stats={stats}
          like={like}
          save={save}
          isOwn={isOwn}
        />
        <ReadFullPopup
          reelKey={titleId}
          href={href}
          external={external}
          gate={gate}
          title={article.title}
        />
      </div>
    </article>
  );
});

/** The poster's author line links to the profile and, on others' stories, carries the Follow "+" (owner 2026-10-05). */
function withAuthorLink(article: ArticleCard, follow: boolean): PosterStory {
  const story = toPosterStory(article);
  return {
    ...story,
    author: {
      ...story.author,
      href: `/${article.author.username}`,
      follow: follow ? (
        <FollowBadge
          username={article.author.username}
          initialFollowing={article.viewer.followingAuthor}
          onPoster
        />
      ) : undefined,
    },
  };
}

/** The poster's top-right markers: the transparency labels and, for a video story, its sound switch with the clip's length. */
function ReelMarkers({ article }: { article: ArticleCard }) {
  const sound = useVideoSound();
  if (
    !hasStoryLabels(article.badges, article.hidden) &&
    !article.video &&
    !article.premium
  )
    return null;
  return (
    <>
      {/* Members-only (owner 2026-10-15): the red diamond in the poster's top-left corner. */}
      {article.premium && <PremiumCorner size={38} />}
      {/* Phones: clear of the rail's column (it lies over the poster's right edge and reaches the top on short screens). */}
      <div className="pointer-events-none absolute right-2.5 top-(--reel-badge-top) z-10 flex flex-col items-end gap-1.5 max-sm:right-14">
        {/* A Spotlight is a paid boost: always labelled. */}
        <StoryLabels
          badges={article.badges}
          hidden={article.hidden}
          className="flex-col items-end"
          pillClassName={ON_PHOTO}
        />
        {/* The clip plays muted in the poster; one sound switch for every video (lib/video-playback.ts). The button
          keeps its taps: no popup, no double-tap like. */}
        {article.video && (
          <button
            type="button"
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            aria-pressed={sound}
            onClick={(event) => {
              event.stopPropagation();
              setVideoSound(!sound);
            }}
            className={cn(
              "pointer-events-auto relative inline-flex h-7 items-center gap-1.5 rounded-full bg-ink/70 pl-2 pr-2.5 text-[0.6875rem] font-bold",
              "text-white backdrop-blur-sm transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-brand",
              "focus-visible:bg-brand [&_svg]:size-3.5",
              ON_PHOTO,
            )}
          >
            {sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            <span className="tabular-nums">
              {clipLength(article.video.durationMs)}
            </span>
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Auto-scroll progress across the top of the active reel's poster. Its CSS animation is the timer (reel-autoscroll.ts):
 * paused with `animation-play-state`, restarted by remounting (`run`), and its end moves the feed on. Decorative.
 */
function ReelProgress({ reelKey }: { reelKey: string }) {
  const { timer, done } = useReelTimer(reelKey);
  if (!timer) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-white/35"
    >
      <span
        key={timer.run}
        className="reel-progress block h-full bg-brand"
        style={{
          animationDuration: `${timer.durationMs}ms`,
          animationPlayState: timer.playing ? "running" : "paused",
        }}
        onAnimationEnd={() => done(timer.run)}
      />
    </span>
  );
}

/**
 * A reel-shaped placeholder: the poster, shimmering, and its action rail (the next page of the feed, a publisher's
 * stories, or the feed itself while the page loads).
 */
export function ReelSkeleton({
  label = "Loading more stories",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="reel-snap pb-(--reel-gap)">
      <div className="reel-frame relative flex h-(--reel-h) items-center justify-center">
        <div className="reel-poster relative">
          <div className="skeleton relative aspect-9/16 w-full rounded-2xl sm:rounded-3xl">
            <SpeedBarsSvg className="absolute left-1/2 top-1/2 w-16 -translate-x-1/2 -translate-y-1/2 text-ink opacity-[0.06]" />
          </div>
          <div
            aria-hidden
            className={cn(
              "absolute bottom-3 right-1.5 flex w-11 flex-col items-center gap-3 py-1.5",
              "sm:bottom-0 sm:left-full sm:right-auto sm:ml-(--reel-rail-gap) sm:w-(--reel-rail-w) sm:py-0",
            )}
          >
            {/* Like, comment, share, save, menu (the author's photo left the rail, owner 2026-10-05). */}
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} shape="circle" className="size-7 bg-border" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
