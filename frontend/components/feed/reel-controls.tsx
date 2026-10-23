"use client";

import { askUnfollow } from "@/components/follow/unfollow-confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Flag, Pause, Play, Plus } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { handleText } from "@/components/brand/user-handle";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import type { DropdownItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, type FollowResult } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ArticleCard } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { CommentButton } from "./comment-button";
import { LikeButton } from "./like-button";
import type { StatCounts } from "./live-state";
import { FlagDialog, useReportedReason } from "./flag-dialog";
import { SoundBars, useNewsRadio, useRadioMenuItem } from "./news-radio";
import { REEL_SECONDS, setAutoScroll, useAutoScrollPreference, useReelAutoplayController } from "./reel-autoscroll";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import { reporterMarkText } from "./story-badges";
import { StoryMenu } from "./story-menu";
import type { LikeApi } from "./use-like";
import type { SaveApi } from "./use-save";

/* ─────────────── Action rail ─────────────── */

/**
 * Rail tone. Phones: white icons straight on the poster — no capsule behind them (owner 2026-09-28: no glass, just
 * transparent) — with a dark shadow on icons and counts so they read on any photo; ≥640px: ink on the page, brand on
 * hover (owner 2026-10-07: the redesign's grey tiles were undone). It overrides the reused buttons' own colours; their states (a liked heart, a saved bookmark, a reported
 * flag) stay brand red on the icon itself.
 */
const ON_PHOTO_SHADOW = "[&_svg]:drop-shadow-[0_1px_3px_rgb(0_0_0/0.7)] [text-shadow:0_1px_3px_rgb(0_0_0/0.75)]";
const RAIL_TONE = cn(
  "max-sm:text-white max-sm:hover:bg-white/10 max-sm:[&_svg]:drop-shadow-[0_1px_3px_rgb(0_0_0/0.7)] max-sm:[text-shadow:0_1px_3px_rgb(0_0_0/0.75)]",
  "sm:text-ink-2 sm:hover:bg-tint sm:hover:text-brand",
);

/**
 * A control with its count under the icon (like, comment, share). Bigger since the rail got shorter (owner 2026-10-02:
 * "clearly visible"): phones 26px icons in 44px buttons, ≥640px 30px icons.
 */
const RAIL_COUNTED = cn(
  // Phones (owner 2026-10-16: "smaller, in the corner"): 22px icons in 40px buttons; ≥640px as before.
  "h-auto min-h-10 w-10 flex-col justify-center gap-0.5 rounded-2xl px-0 py-0.5 text-[0.6875rem] font-bold leading-none after:-inset-0.5",
  "sm:min-h-12 sm:w-13 sm:gap-1 sm:py-1 sm:text-[0.8125rem] sm:after:inset-0",
  "[&_svg]:size-5.5 [&>span:first-child]:size-5.5 sm:[&_svg]:size-7.5 sm:[&>span:first-child]:size-7.5",
  // The WebNEWS app (owner 2026-10-16: "a little bigger in the app"): 26px icons in 46px buttons.
  "max-sm:in-data-[app=android]:min-h-11.5 max-sm:in-data-[app=android]:w-11.5 max-sm:in-data-[app=android]:text-xs max-sm:in-data-[app=android]:[&_svg]:size-6.5 max-sm:in-data-[app=android]:[&>span:first-child]:size-6.5",
  RAIL_TONE,
);

/** An icon-only control (News radio). */
const RAIL_ICON = cn(
  "size-10 rounded-2xl px-0 after:-inset-0.5 sm:size-13 sm:after:inset-0 [&_svg]:size-5.5 [&>span]:size-5.5 sm:[&_svg]:size-7.5 sm:[&>span]:size-7.5",
  "max-sm:in-data-[app=android]:size-11.5 max-sm:in-data-[app=android]:[&_svg]:size-6.5 max-sm:in-data-[app=android]:[&>span]:size-6.5",
  RAIL_TONE,
);

/** StoryMenu only styles its wrapper: its ⋮ button gets the rail look through `[&>button]`. */
const RAIL_MENU = cn(
  "[&>button]:size-10 [&>button]:rounded-2xl [&>button]:after:-inset-0.5 sm:[&>button]:size-13 sm:[&>button]:after:inset-0",
  "[&>button_svg]:size-5.5 sm:[&>button_svg]:size-7.5",
  "max-sm:in-data-[app=android]:[&>button]:size-11.5 max-sm:in-data-[app=android]:[&>button_svg]:size-6.5",
  "max-sm:[&>button]:text-white max-sm:[&>button]:hover:bg-white/10 max-sm:[&>button_svg]:drop-shadow-[0_1px_3px_rgb(0_0_0/0.7)]",
  "sm:[&>button]:text-ink-2",
);

/** ≥640px the rail leaves the poster for a plain column just outside its right edge, on the page. */
const RAIL_BESIDE = "sm:bottom-0 sm:left-full sm:right-auto sm:ml-(--reel-rail-gap) sm:w-(--reel-rail-w) sm:gap-1 sm:py-0";

/** The composer's preview (`preview`): the phone look above at every screen width (it's inert: no hover states). */
const PREVIEW_TONE = cn("text-white", ON_PHOTO_SHADOW);
const PREVIEW_COUNTED = cn(
  "h-auto min-h-10 w-10 flex-col justify-center gap-0.5 rounded-2xl px-0 py-1 text-[0.625rem] font-bold leading-none after:-inset-0.5",
  "[&_svg]:size-5 [&>span:first-child]:size-5",
  PREVIEW_TONE,
);
const PREVIEW_ICON = cn("size-10 rounded-2xl px-0 after:-inset-0.5 [&_svg]:size-5 [&>span]:size-5", PREVIEW_TONE);

/** The Follow "+" badge on the author's photo (FollowBadge; a static copy of it in the preview). */
const FOLLOW_BADGE = cn(
  "absolute bottom-0 left-1/2 -ml-2.5 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-white",
  // The hit area grows sideways and down only, so the photo above it stays the author link.
  "after:absolute after:-inset-x-2.5 after:top-0 after:-bottom-2.5 after:content-[''] [&_svg]:size-3",
);

export type ReelRailProps = {
  article: ArticleCard;
  /** Live counts (useArticleStats). */
  stats: StatCounts;
  /** The reel's like state, shared with the poster's double-tap. */
  like: LikeApi;
  save: SaveApi;
  /** The viewer's own story: no Follow badge, no Report item. */
  isOwn: boolean;
  /**
   * The composer's preview (ReelCard `preview`, which makes it inert): the rail as readers will see it on a phone at
   * every screen width — on the poster, a static Follow badge, News radio and ⋯ — whoever is looking.
   */
  preview?: boolean;
};

/**
 * A reel's actions (owner 2026-09-26, Instagram style): a thin column of small icons on the right, top to bottom
 * like, comment (→ the comments sheet), share, save (owner 2026-10-05: out of the menu) and the menu (the WebNEWS
 * three bars) — News radio, Report (owner 2026-10-05: in here, never on your own story) and the feed's Auto-scroll
 * switch (only in a feed that auto-scrolls), then the author's / desk's own items. Phones: over the
 * poster's right edge, transparent (white icons with a dark shadow, legible on any photo); ≥640px: just outside the
 * poster's right edge, on the page. The buttons are the same components as on story cards (same state, counts,
 * sheets and menus), restyled; counts are the live ones. Render it inside the reel's poster box (`relative`).
 * `data-reel-rail`: a tap on it never opens the "Read full article" popup, which also keeps clear of it (reel-popup.tsx).
 * `preview`: the composer's copy (see ReelRailProps); no `data-reel-rail`, no links, no follow requests.
 */
export function ReelRail({ article, stats, like, save, isOwn, preview = false }: ReelRailProps) {
  const autoplay = useReelAutoplayController();
  const autoScrollOn = useAutoScrollPreference();
  const authPrompt = useAuthPrompt();
  const reported = useReportedReason(article) !== null;
  const [flagOpen, setFlagOpen] = useState(false);
  // Mount the reason sheet on first use only (every reel has a rail).
  const [flagMounted, setFlagMounted] = useState(false);
  // News radio and Report live in the menu, above the author's / desk's own items; Save is a button on the rail beside
  // Comment and Share (owner 2026-10-05), and so is Auto-scroll, right after Share (owner 2026-10-16: out of the menu).
  const radioItem = useRadioMenuItem(article.id);
  const radio = useNewsRadio();
  const menuItems: DropdownItem[] = [
    ...(radioItem && !preview ? [radioItem] : []),
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
          } satisfies DropdownItem,
        ]),
  ];
  const profileRef = useRef<HTMLAnchorElement>(null);
  const level = article.badges?.reporterLevel ?? null;
  const handle = handleText(article.author.username);
  const counted = preview ? PREVIEW_COUNTED : RAIL_COUNTED;
  const icon = preview ? PREVIEW_ICON : RAIL_ICON;

  const avatar = (
    <Avatar
      src={article.author.image}
      name={article.author.name}
      size={38}
      decorative
      className={cn("ring-2 ring-white shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)]", !preview && "sm:ring-border sm:shadow-none")}
    />
  );

  return (
    // Owner rule: these animations (the heart's spring, the Follow badge, rolling counts) also run under Reduce Motion.
    <MotionConfig reducedMotion="never">
      <div
        data-reel-rail={!preview || undefined}
        role="group"
        aria-label="Story actions"
        className={cn(
          "absolute z-20 flex flex-col items-center",
          // Phones: no capsule — the icons sit straight on the poster (their own shadows keep them legible).
          // Phones: tucked into the bottom-right corner (owner 2026-10-16).
          "bottom-1.5 right-0 w-10 gap-0.5 py-0.5 max-sm:in-data-[app=android]:w-11.5 max-sm:in-data-[app=android]:gap-1",
          !preview && RAIL_BESIDE,
        )}
      >
        {/* The author's photo left the rail (owner 2026-10-05): the poster's author line carries it, with the Follow
            "+" on it. Keyboard and screen-reader users keep the profile link and Follow here — shown only while focused. */}
        {!preview && (
          <div className="sr-only mb-1 w-full justify-center pb-2 focus-within:not-sr-only focus-within:relative focus-within:flex">
            <Link
              ref={profileRef}
              href={`/${article.author.username}`}
              aria-label={`${article.author.name} (${handle})${reporterMarkText(level)}`}
              title={`${article.author.name} (${handle})`}
              className="inline-flex size-11 items-center justify-center rounded-full transition-transform duration-150 active:scale-95 sm:size-12"
            >
              {avatar}
            </Link>
            {!isOwn && (
              <FollowBadge username={article.author.username} initialFollowing={article.viewer.followingAuthor} returnFocusTo={profileRef} />
            )}
          </div>
        )}
        {/* While auto-scroll or News radio runs, its Stop sits on the reel itself (owner 2026-10-05: no trip into the
            menu to stop it). */}
        <AnimatePresence initial={false}>
          {!preview && radio?.onAir && (
            <RailStop key="stop-radio" label="Stop News radio" onClick={radio.stop}>
              <SoundBars />
            </RailStop>
          )}
        </AnimatePresence>
        <LikeButton like={like} count={stats.likeCount} className={counted} />
        <CommentButton article={article} count={stats.commentCount} inert={preview} className={counted} />
        <ShareButton
          article={article}
          count={stats.shareCount}
          inert={preview}
          className={preview ? counted : cn(RAIL_COUNTED, "max-sm:aria-expanded:bg-white/15")}
        />
        {!preview && autoplay && (
          <button
            type="button"
            onClick={(event) => {
              setAutoScroll(!autoScrollOn);
              event.currentTarget.blur();
            }}
            aria-pressed={autoScrollOn}
            data-tour="autoscroll"
            aria-label={autoScrollOn ? "Turn off auto-scroll" : `Auto-scroll — next story every ${REEL_SECONDS} s`}
            title={autoScrollOn ? "Turn off auto-scroll" : `Auto-scroll — next story every ${REEL_SECONDS} s`}
            className={cn("inline-flex items-center justify-center", icon)}
          >
            {autoScrollOn ? <Pause aria-hidden className="fill-brand text-brand" /> : <Play aria-hidden />}
          </button>
        )}
        {preview ? (
          <span aria-hidden className={cn("inline-flex items-center justify-center", icon)}>
            <Bookmark strokeWidth={2.25} />
          </span>
        ) : (
          <SaveButton save={save} className={icon} />
        )}
        {preview ? (
          <span aria-hidden className={cn("inline-flex items-center justify-center", icon)}>
            <SpeedBarsSvg className="scale-[0.8]" />
          </span>
        ) : (
          <StoryMenu article={article} vertical leadItems={menuItems} className={RAIL_MENU} />
        )}
      </div>
      {flagMounted && <FlagDialog articleId={article.id} title={article.title} open={flagOpen} onOpenChange={setFlagOpen} />}
    </MotionConfig>
  );
}

/** A red round Stop on the rail (auto-scroll, News radio) with "Stop" under it, popping in while that runs. */
function RailStop({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 520, damping: 26 }}
      className={cn(
        "mb-1 flex w-11 flex-col items-center gap-1 rounded-2xl py-1 text-[0.75rem] font-bold leading-none sm:w-13 sm:text-[0.8125rem]",
        "max-sm:text-white max-sm:[text-shadow:0_1px_3px_rgb(0_0_0/0.75)] sm:text-brand",
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)] transition-colors hover:bg-brand-hover sm:size-10">
        {children}
      </span>
      Stop
    </motion.button>
  );
}

/** How long the badge shows its check after a follow from it, before it goes. */
const FOLLOWED_MS = 1_200;

/**
 * Follow in one tap: a small red "+" on the author's photo (the rail's keyboard copy), or — `onPoster` — an outlined
 * pill after the name on the poster (owner 2026-10-07, like Instagram's reels) that stays: Follow ⇄ Following. Same state and requests as FollowButton (the
 * `qk.followState` cache, optimistic, rolled back on failure, the same caches refreshed; logged out → the log-in
 * prompt), so every Follow button for this publisher agrees. Only while not following: after a follow from here it
 * turns into a check for a moment and goes (keyboard focus moves back to the photo's link). Never on your own stories.
 */
export function FollowBadge({
  username,
  initialFollowing,
  returnFocusTo,
  onPoster = false,
}: {
  username: string;
  initialFollowing: boolean;
  returnFocusTo?: RefObject<HTMLAnchorElement | null>;
  /**
   * On the poster's author photo (owner 2026-10-05), sized with it in cqw. Out of the tab order there (the poster is
   * aria-hidden); the rail keeps a keyboard copy.
   */
  onPoster?: boolean;
}) {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const key = qk.followState(username);
  const handle = handleText(username);

  const { data: following = initialFollowing } = useQuery({
    queryKey: key,
    queryFn: () => initialFollowing,
    initialData: initialFollowing,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const mutation = useMutation<FollowResult, unknown, boolean, { previous: boolean }>({
    mutationFn: (next) => (next ? api.follow(username) : api.unfollow(username)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key) ?? initialFollowing;
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(key, context?.previous ?? initialFollowing);
      setConfirming(false);
      if (isApiError(error) && error.isUnauthorized) {
        authPrompt.open(`Log in to follow ${handle}`);
        return;
      }
      toast.error(`Couldn't update your follow of ${handle}`, { description: errorMessage(error), id: `follow-${username}` });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(key, result.following);
      void queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      if (viewer?.username) {
        void queryClient.invalidateQueries({ queryKey: qk.following(viewer.username) });
      }
      void queryClient.invalidateQueries({ queryKey: qk.followers(username) });
      void queryClient.invalidateQueries({ queryKey: qk.feed("following") });
    },
  });

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => {
      if (document.activeElement === buttonRef.current) returnFocusTo?.current?.focus();
      setConfirming(false);
    }, FOLLOWED_MS);
    return () => clearTimeout(timer);
  }, [confirming, returnFocusTo]);

  if (viewer?.username && viewer.username === username) return null;

  const onClick = () => {
    if (!authPrompt.guard(`Log in to follow ${handle}`)) return;
    if (following || mutation.isPending) return;
    setConfirming(true);
    mutation.mutate(true);
  };

  // On a poster (owner 2026-10-07, like Instagram's reels): an outlined pill after the name, in the byline's colour, that
  // stays — "Follow", and once tapped "Following"; tapping "Following" unfollows.
  if (onPoster) {
    const toggle = () => {
      if (!authPrompt.guard(`Log in to follow ${handle}`)) return;
      if (mutation.isPending) return;
      // Unfollowing asks first (owner 2026-10-14).
      if (following) askUnfollow(username, () => mutation.mutate(false));
      else mutation.mutate(true);
    };
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-pressed={following}
        aria-label={following ? `Following ${handle} — tap to unfollow` : `Follow ${handle}`}
        tabIndex={-1}
        className={cn(
          // In the byline's unit (`--bu`: 1cqw, or more on the home grid's small tiles).
          // Slim (owner 2026-10-08: it was crowding the name out): smaller text, tighter padding.
          "relative inline-flex h-[calc(var(--bu,1cqw)*5)] shrink-0 items-center rounded-[calc(var(--bu,1cqw)*1.5)] border-[length:max(1px,calc(var(--bu,1cqw)*0.3))] px-[calc(var(--bu,1cqw)*1.6)] text-[length:calc(var(--bu,1cqw)*2.7)] font-bold leading-none whitespace-nowrap",
          "transition-colors after:absolute after:-inset-[calc(var(--bu,1cqw)*1.6)] after:content-['']",
          // See-through (owner 2026-10-08): an outline only, in both states — no box over the photo.
          following ? "border-current/55 bg-transparent" : "border-current/80 bg-transparent hover:bg-current/10",
        )}
      >
        {following ? "Following" : "Follow"}
      </button>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {(!following || confirming) && (
        <motion.button
          ref={buttonRef}
          key="follow"
          type="button"
          onClick={onClick}
          aria-pressed={following}
          aria-label={following ? `Following ${handle}` : `Follow ${handle}`}
          title={following ? `Following ${handle}` : `Follow ${handle}`}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
          tabIndex={onPoster ? -1 : undefined}
          // 20px on the photo's bottom edge; an invisible extension makes the touch target bigger.
          className={cn(
            FOLLOW_BADGE,
            following ? "bg-surface text-brand" : "bg-brand text-brand-contrast hover:bg-brand-hover",
          )}
        >
          {following ? <Check aria-hidden strokeWidth={3.5} /> : <Plus aria-hidden strokeWidth={3.5} />}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
