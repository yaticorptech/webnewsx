"use client";

import { PremiumCorner } from "./premium";
import { Ellipsis, EllipsisVertical, Eye, Flag, Play, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { FollowControl } from "@/components/follow/follow-button";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { showPendingPage } from "@/components/layout/pending-page";
import { Avatar } from "@/components/ui/avatar";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { showAppUpdateForSpeech, useSpeechNeedsAppUpdate } from "@/lib/speech";
import type { ArticleCard } from "@/lib/shared/contracts";
import { openStoryHref, storyHref, storyLinkProps } from "@/lib/story-link";
import { track } from "@/lib/track";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommentButton } from "./comment-button";
import { FlagDialog, useReportedReason } from "./flag-dialog";
import { LikeButton } from "./like-button";
import { useArticleStats } from "./live-state";
import { SoundBars, useNewsRadio } from "./news-radio";
import { SaveButton } from "./save-button";
import { hasIndicScript, INDIC_HEADLINE } from "./script";
import { ShareButton } from "./share-button";
import { ReporterMark, SpotlightedTag, StoryLabels } from "./story-badges";
import { DOUBLE_TAP_MS, HeartPop } from "./story-cover";
import { StoryMenu } from "./story-menu";
import { useLike } from "./use-like";
import { useSave } from "./use-save";
import { useViewTracking } from "./view-tracker";

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The action row's buttons: dark words, a red heart (its fill shows a like). */
const ACTION = "px-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink-2";

export type PhoneStoryCardProps = {
  article: ArticleCard;
  /** Eager image (the first posts on screen). */
  priority?: boolean;
  /** Arrived live a moment ago: "Just in". */
  justIn?: boolean;
};

/**
 * A story in Home's feed on phones (owner 2026-10-10, from their Instagram-style reference) — every post the same, top
 * to bottom: (A) the reporter — photo, name with the Verified badge, how long ago, Follow, ⋮; (B) the story's photo
 * across the screen in one fixed shape (no section badge — owner 2026-10-10), the headline over a dark fade at its foot with a red
 * bar (a tap opens the story, a double tap likes it); (C) like · comment · share … save, as everywhere; (D) the
 * reporter's name and the start of the story (two lines, "…") and "Read more" — both open the story (or its Read more link). Wider screens keep the
 * poster grid (news-card.tsx). No place line: the only place a story carries is its district, which the owner asked
 * not to show (2026-10-09).
 */
export function PhoneStoryCard({ article, priority = false, justIn = false }: PhoneStoryCardProps) {
  const ref = useRef<HTMLElement>(null);
  const router = useRouter();
  const titleId = useId();
  const isOwn = article.viewer.isAuthor;
  useViewTracking(ref, article.id, !isOwn);
  const stats = useArticleStats(article);
  const like = useLike(article);
  const save = useSave(article);
  const radio = useNewsRadio();
  const onAir = radio?.onAir?.id === article.id;

  // A story filed with a Read more link opens that link from every spot on the card (owner 2026-10-15).
  const target = storyHref(article);
  const { href } = target;
  const linkProps = storyLinkProps(article);
  const profileHref = `/${article.author.username}`;
  const level = article.badges?.reporterLevel ?? null;
  const image = article.articleImage ?? { url: article.coverUrl, blur: article.coverBlur };
  // A Read more link story shows no text, just the name and "Read more" (owner 2026-10-15).
  const excerpt = target.external ? "" : (article.excerpt?.trim() ?? "");

  // A tap on the photo opens the story; a double tap likes it, with the big heart (so a single tap waits out the
  // double-tap window first).
  const lastTap = useRef(0);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heart, setHeart] = useState(0);
  useEffect(
    () => () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    },
    [],
  );
  const onPhoto = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
      window.open(href, "_blank", "noopener");
      return;
    }
    const now = event.timeStamp;
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (navTimer.current) clearTimeout(navTimer.current);
      navTimer.current = null;
      setHeart((n) => n + 1);
      like.like();
      track("double_tap_like", { articleId: article.id });
      return;
    }
    lastTap.current = now;
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => {
      navTimer.current = null;
      openStoryHref(target, (path) => {
        showPendingPage(path);
        router.push(path);
      }, true);
    }, DOUBLE_TAP_MS);
  };

  return (
    <article ref={ref} aria-labelledby={titleId} className="flex flex-col pb-4">
      {/* A — the reporter. */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Link href={profileHref} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
          <Avatar src={article.author.image} name={article.author.name} size={42} decorative className="ring-1 ring-border" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profileHref} className="flex min-w-0 items-center gap-1 rounded-sm outline-offset-2">
            <span className="truncate text-[0.9375rem] font-bold leading-tight text-ink">{article.author.name}</span>
            <ReporterMark level={level} size={16} focusable={false} />
          </Link>
          {/* Views, then the date — or "Spotlighted" in its place while a boost runs (owner 2026-10-16). */}
          <p className="mt-0.5 flex items-center gap-1 text-[0.8125rem] leading-tight text-muted">
            <span className="inline-flex shrink-0 items-center gap-1" title={`${formatNumber(stats.viewCount)} views`}>
              <Eye aria-hidden className="size-3.5" strokeWidth={2} />
              <span className="tabular-nums">{formatNumber(stats.viewCount)}</span>
              <span className="sr-only"> views</span>
            </span>
            <span aria-hidden>·</span>
            {article.badges?.spotlight ? <SpotlightedTag /> : <TimeAgo date={article.publishedAt} />}
          </p>
        </div>
        {!isOwn && <FollowPill username={article.author.username} initialFollowing={article.viewer.followingAuthor} />}
        <CardMenu article={article} />
      </div>

      {/* B — the photo, one fixed shape for every post (covered, never stretched). */}
      <div
        onClick={onPhoto}
        onPointerDown={() => !target.external && router.prefetch(href)}
        className="relative mx-1 aspect-10/7 cursor-pointer touch-manipulation select-none overflow-hidden rounded-2xl bg-ink-2 bg-cover bg-center"
        style={image.blur ? { backgroundImage: `url(${image.blur})` } : undefined}
      >
        {image.url && (
          <img
            src={image.url}
            alt=""
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-black/85 via-black/40 to-transparent" />

        {/* Members-only: the diamond flush in the photo's top-left corner (owner 2026-10-15). */}
        {article.premium && <PremiumCorner size={36} />}
        <span className={cn("pointer-events-none absolute top-3 flex max-w-[calc(100%-6rem)] flex-wrap items-center gap-1.5", article.premium ? "left-12" : "left-3")}>
          {justIn && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 text-[0.6875rem] font-bold uppercase tracking-wide text-brand shadow-sm">
              <PulseDot size="xs" />
              Just in
            </span>
          )}
          <StoryLabels badges={article.badges} hidden={article.hidden} pillClassName="shadow-sm" />
        </span>
        {article.video && (
          <span className="pointer-events-none absolute right-3 top-3 inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-xs font-semibold tabular-nums text-white backdrop-blur-sm">
            <Play aria-hidden className="size-3 fill-white" />
            {duration(article.video.durationMs)}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 flex gap-2.5 p-3.5 pr-5">
          <span aria-hidden className="w-1 shrink-0 rounded-full bg-brand" />
          <h2
            id={titleId}
            // Any language: Urdu / Sindhi / Kashmiri text reads right-to-left.
            dir="auto"
            className={cn(
              "line-clamp-2 text-[1.0625rem] font-extrabold leading-snug text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]",
              hasIndicScript(article.title) && INDIC_HEADLINE,
            )}
          >
            {/* Taps go to the photo (open / double-tap like); the link is for keyboards and screen readers. */}
            <Link {...linkProps} className="pointer-events-none rounded-sm outline-offset-2">
              {article.title}
            </Link>
          </h2>
        </div>
        <HeartPop beat={heart} onDone={() => setHeart(0)} />
      </div>

      {/* C — the actions, as everywhere. */}
      <div className="flex h-12 items-center px-1.5">
        <LikeButton like={like} count={stats.likeCount} size="md" className={cn(ACTION, "[&_svg]:text-brand")} />
        <CommentButton article={article} count={stats.commentCount} size="md" className={ACTION} />
        <ShareButton article={article} count={stats.shareCount} size="md" className={ACTION} />
        {/* News radio is reading this story (owner 2026-10-01): a red sound-bars button; tap to stop. */}
        {onAir && radio && (
          <button
            type="button"
            onClick={radio.stop}
            aria-label="Stop News radio"
            title="On air · tap to stop"
            className="relative ml-1 inline-flex size-7 shrink-0 animate-fade-up items-center justify-center rounded-full bg-brand text-brand-contrast shadow-sm after:absolute after:-inset-2 after:content-['']"
          >
            <SoundBars />
          </button>
        )}
        <SaveButton save={save} size="md" className={cn(ACTION, "ml-auto")} />
      </div>

      {/* D — the reporter's name and the start of the story: two lines at most, ending "…" (owner 2026-10-10); a tap on
          it opens the story, like "Read more" under it. */}
      {/* D — Instagram / Facebook style caption (owner 2026-10-15): the reporter's name, two lines of the story, then a
          red "… Read more" that opens the story (or its Read more link). */}
      <Caption
        excerpt={excerpt}
        moreLabel={`${article.title}${target.external ? ` (opens ${article.linkDomain ?? "the source"} in a new tab)` : ""}`}
        linkProps={linkProps}
        author={
          <Link href={profileHref} className="mr-1.5 font-bold text-ink">
            {article.author.name}
            {level === "verified" && <ReporterMark level={level} size={14} focusable={false} className="ml-1 inline-block align-[-0.15em]" />}
          </Link>
        }
      />
    </article>
  );
}

/**
 * The caption: name + the whole blurb, then " Read more" (owner 2026-10-15: never cut; blurbs are 50–100 characters).
 * A tap on the text or "Read more" opens the story.
 */
function Caption({ excerpt, author, linkProps, moreLabel }: { excerpt: string; author: ReactNode; linkProps: ReturnType<typeof storyLinkProps>; moreLabel: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [excerpt]);

  const more = (
    <>
      Read more<span className="sr-only">: {moreLabel}</span>
    </>
  );
  return (
    <div className="relative px-3">
      <p ref={ref} dir="auto" className={cn("text-sm leading-relaxed text-ink-2", hasIndicScript(excerpt) && "leading-[1.6]")}>
        {author}
        {excerpt && (
          <Link {...linkProps} tabIndex={-1} className="transition-colors hover:text-ink">
            {excerpt}
          </Link>
        )}
        {!cut && (
          <Link {...linkProps} className="ml-1 font-bold text-brand hover:text-brand-hover">
            {more}
          </Link>
        )}
      </p>
      {cut && (
        <Link
          {...linkProps}
          className={cn(
            "absolute bottom-0 right-3 bg-bg pl-1 text-sm font-bold text-brand hover:text-brand-hover",
            // A short fade in front, so a clipped letter never peeks out beside it.
            "before:pointer-events-none before:absolute before:inset-y-0 before:-left-6 before:w-6 before:bg-linear-to-r before:from-transparent before:to-bg",
            hasIndicScript(excerpt) ? "leading-[1.6]" : "leading-relaxed",
          )}
        >
          <span aria-hidden className="text-ink-2">… </span>
          {more}
        </Link>
      )}
    </div>
  );
}

/**
 * Follow in the reporter row: a small red outline pill; once you follow, "Following" with the bell menu — All / None /
 * Unfollow (owner 2026-10-16), opened straight after the follow.
 */
function FollowPill({ username, initialFollowing }: { username: string; initialFollowing: boolean }) {
  const base =
    "relative inline-flex h-7.5 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors after:absolute after:-inset-1.5 after:content-[''] active:scale-95";
  return (
    <FollowControl
      username={username}
      initialFollowing={initialFollowing}
      followClassName={cn(base, "border-brand/70 text-brand hover:bg-tint")}
      followingClassName={cn(base, "px-2.5 border-border-strong text-ink-2 hover:bg-surface-2")}
      iconClassName="size-3.5"
    />
  );
}

/** ⋮ in the reporter row: report and News radio, then the author's / the desk's own tools (Spotlight, stats, category). */
/** The card's ⋮ menu; `compact` = the desktop front page's ⋯ (smaller, horizontal dots). */
export function CardMenu({ article, compact = false }: { article: ArticleCard; compact?: boolean }) {
  const isOwn = article.viewer.isAuthor;
  const authPrompt = useAuthPrompt();
  const reported = useReportedReason(article) !== null;
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagMounted, setFlagMounted] = useState(false);
  const radio = useNewsRadio();
  const needsAppUpdate = useSpeechNeedsAppUpdate();
  const onAir = radio?.onAir?.id === article.id;
  return (
    <>
      <StoryMenu
        article={article}
        size="xs"
        up={false}
        align="end"
        className="-mr-1.5 shrink-0"
        trigger={compact ? <Ellipsis aria-hidden /> : <EllipsisVertical aria-hidden />}
        triggerClassName={cn(
          "text-ink hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-3 aria-expanded:text-ink",
          compact ? "size-7 text-muted [&_svg]:size-4.5" : "size-9 [&_svg]:size-5",
        )}
        leadItems={[
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
      {flagMounted && <FlagDialog articleId={article.id} title={article.title} open={flagOpen} onOpenChange={setFlagOpen} />}
    </>
  );
}

/** A post-shaped placeholder: the reporter row, the photo, the actions and two lines. */
export function PhoneStoryCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col pb-4">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="skeleton size-10.5 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="skeleton h-3.5 w-32 rounded-sm" />
          <div className="skeleton h-3 w-16 rounded-sm" />
        </div>
      </div>
      <div className="skeleton mx-1 aspect-10/7 rounded-2xl" />
      <div className="flex h-12 items-center gap-5 px-4">
        <div className="skeleton size-5 rounded-full" />
        <div className="skeleton size-5 rounded-full" />
        <div className="skeleton size-5 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 px-3">
        <div className="skeleton h-3 w-full rounded-sm" />
        <div className="skeleton h-3 w-2/3 rounded-sm" />
      </div>
    </div>
  );
}
