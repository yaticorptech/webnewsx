"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { FollowControl } from "@/components/follow/follow-button";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ArticleCard } from "@/lib/shared/contracts";
import { storyLinkProps } from "@/lib/story-link";
import { cn } from "@/lib/utils";
import { CommentButton } from "./comment-button";
import { LikeButton } from "./like-button";
import { useArticleStats } from "./live-state";
import { hasIndicScript, INDIC_HEADLINE } from "./script";
import { ShareButton } from "./share-button";
import { ReporterMark } from "./story-badges";
import { useLike } from "./use-like";
import { useViewTracking } from "./view-tracker";
import { CardMenu } from "./phone-story-card";
import { PremiumCorner } from "./premium";

/** The carousel's stories, then the two beside it; the rest are the "Latest stories" cards. */
const HERO = 4;
const SIDE = 2;

/** like · comment · share on a photo (white) or on a card (muted). */
const ON_PHOTO = "px-2 text-white hover:bg-white/15 hover:text-white";
const ON_CARD = "px-1.5 text-muted hover:bg-surface-2 hover:text-ink";

/**
 * Home on tablets and computers (owner 2026-10-10, from their reference — a news-magazine front page): a big carousel of
 * the first stories (arrows, dots, "1/4", sliding on by itself), two stories beside it, then "Latest stories" as photo
 * cards (section badge, headline, reporter, like · comment · share). The side menu and "Trending now" are the shell's.
 * Phones have their own posts (phone-story-card.tsx). Every story keeps its live counts, view counting and links.
 */
export function DesktopFeed({
  items,
  justIn,
  heading,
  viewAllHref,
  loadingMore,
  followingHero = false,
}: {
  items: ArticleCard[];
  justIn: ReadonlySet<string>;
  heading: string;
  /** "View all →" beside the heading (Home: the newest-first list). */
  viewAllHref?: string;
  loadingMore: boolean;
  /**
   * Home (owner 2026-10-14): the top section is ONE full-width carousel of the latest stories from reporters the viewer
   * follows (looping), or "Follow reporters…" when they follow no one; the feed's own stories all go below it.
   */
  followingHero?: boolean;
}) {
  const hero = followingHero ? [] : items.slice(0, HERO);
  const side = followingHero ? [] : items.slice(HERO, HERO + SIDE);
  const rest = followingHero ? items : items.slice(HERO + SIDE);
  return (
    <div className="flex flex-col gap-8">
      {followingHero ? (
        <FollowingHero justIn={justIn} />
      ) : (
      <section aria-label="Top stories" className={cn("grid gap-4", side.length > 0 && "md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]")}>
        <HeroCarousel items={hero} justIn={justIn} />
        {side.length > 0 && (
          <ul className="grid gap-4 max-md:grid-cols-2 md:grid-rows-2">
            {side.map((article) => (
              <li key={article.id} data-feed-item={article.id} className="min-h-0">
                <SideStory article={article} justIn={justIn.has(article.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {(rest.length > 0 || loadingMore) && (
        <section aria-labelledby="latest-stories" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="latest-stories" className="font-wide text-2xl font-black tracking-tight text-ink">
              {heading}
            </h2>
            {viewAllHref && (
              <Link href={viewAllHref} className="group inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:text-brand-hover">
                View all
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
          <ul className={TILE_GRID}>
            {rest.map((article) => (
              <li key={article.id} data-feed-item={article.id} className="min-w-0 animate-fade-up">
                <StoryTile article={article} justIn={justIn.has(article.id)} />
              </li>
            ))}
            {loadingMore && Array.from({ length: 4 }, (_, i) => <li key={`s${i}`}><StoryTileSkeleton /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export const TILE_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
/** The top section's height: the carousel and the two stories beside it. */
const TOP_H = "h-[clamp(20rem,34vw,32rem)]";

/* ─────────────────────────── Carousel ─────────────────────────── */

function HeroCarousel({ items, justIn, label = "Top stories" }: { items: ArticleCard[]; justIn: ReadonlySet<string>; label?: string }) {
  const rowRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(0);
  const count = items.length;
  const go = (index: number) => {
    const row = rowRef.current;
    if (!row || count === 0) return;
    // `count` = the copy of the first slide after the last: the row keeps moving forward, then jumps back unseen.
    const next = index < 0 ? count - 1 : Math.min(index, count);
    row.scrollTo({ left: next * row.clientWidth, behavior: "smooth" });
  };

  // On by itself every 5 s, looping (owner 2026-10-14) — also with Reduce Motion on (the owner's Mac has it on and wants
  // the carousel to move); not while the pointer or focus is on it, or the tab is hidden.
  useEffect(() => {
    if (count < 2) return;
    const timer = window.setInterval(() => {
      const row = rowRef.current;
      if (!row || pausedRef.current || document.hidden) return;
      go(Math.round(row.scrollLeft / row.clientWidth) + 1);
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` only reads the ref and `count`
  }, [count]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("relative overflow-hidden rounded-3xl bg-ink shadow-card", TOP_H)}
      onPointerEnter={() => (pausedRef.current = true)}
      onPointerLeave={() => (pausedRef.current = false)}
      onFocus={() => (pausedRef.current = true)}
      onBlur={() => (pausedRef.current = false)}
    >
      <ul
        ref={rowRef}
        onScroll={() => {
          const row = rowRef.current;
          if (!row) return;
          const index = Math.round(row.scrollLeft / row.clientWidth);
          setActive(index % Math.max(1, count));
          // Landed on the copy of the first slide: jump back to the real one once the scroll settles.
          if (settle.current) clearTimeout(settle.current);
          if (count > 1 && index >= count) {
            settle.current = setTimeout(() => row.scrollTo({ left: 0, behavior: "instant" }), 120);
          }
        }}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
      >
        {items.map((article, index) => (
          <li key={article.id} data-feed-item={article.id} className="h-full w-full shrink-0 snap-start" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
            <PhotoStory article={article} justIn={justIn.has(article.id)} size="hero" priority={index === 0} />
          </li>
        ))}
        {count > 1 && (
          <li aria-hidden inert className="h-full w-full shrink-0 snap-start">
            <PhotoStory article={items[0]!} justIn={justIn.has(items[0]!.id)} size="hero" />
          </li>
        )}
      </ul>
      {count > 1 && (
        <>
          <span className="pointer-events-none absolute right-4 top-4 z-20 rounded-full bg-black/45 px-3 py-1 text-sm font-semibold tabular-nums text-white backdrop-blur-sm">
            {active + 1}/{count}
          </span>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Stories ─────────────────────────── */

export function JustInBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide text-brand">
      <PulseDot size="xs" />
      Just in
    </span>
  );
}

/** A story on its photo — the carousel's slides and the two beside it: badge, headline, reporter, like · comment · share. */
function PhotoStory({ article, justIn, size, priority = false }: { article: ArticleCard; justIn: boolean; size: "hero" | "side"; priority?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useViewTracking(ref, article.id, !article.viewer.isAuthor);
  const stats = useArticleStats(article);
  const like = useLike(article);
  const linkProps = storyLinkProps(article);
  const image = article.articleImage ?? { url: article.coverUrl, blur: article.coverBlur };
  const hero = size === "hero";
  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      className={cn("group relative isolate h-full overflow-hidden bg-ink text-white", hero ? "" : cn("rounded-2xl shadow-card max-md:h-56", "md:h-full"))}
    >
      <Link {...linkProps} tabIndex={-1} aria-hidden className="absolute inset-0 -z-10 bg-ink-2 bg-cover bg-center" style={image.blur ? { backgroundImage: `url(${image.blur})` } : undefined}>
        {image.url && (
          <img
            src={image.url}
            alt=""
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            draggable={false}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />
      </Link>
      {article.premium && <PremiumCorner size={36} />}
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 flex flex-col", hero ? "gap-3 p-6 pb-9 lg:p-8 lg:pb-10" : "gap-2 p-4")}>
        <span className="flex flex-wrap gap-1.5">
          {justIn && <JustInBadge />}
        </span>
        <h2
          id={titleId}
          dir="auto"
          className={cn(
            "font-extrabold leading-tight [text-shadow:0_1px_3px_rgb(0_0_0/0.4)]",
            hero ? "line-clamp-3 text-[clamp(1.375rem,2.3vw,2.125rem)]" : "line-clamp-3 text-base lg:text-lg",
            hasIndicScript(article.title) && INDIC_HEADLINE,
          )}
        >
          <Link {...linkProps} className="pointer-events-auto rounded-sm outline-offset-2 hover:underline">
            {article.title}
          </Link>
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="pointer-events-auto flex min-w-0 items-center gap-2 text-sm">
            <Link href={`/${article.author.username}`} className="flex min-w-0 items-center gap-2">
              <Avatar src={article.author.image} name={article.author.name} size={hero ? 32 : 26} decorative className="ring-2 ring-white/80" />
              <span className="truncate font-semibold">{article.author.name}</span>
              <ReporterMark level={article.badges?.reporterLevel ?? null} size={15} focusable={false} />
              <TimeAgo date={article.publishedAt} className="shrink-0 text-white/75" />
            </Link>
            {!article.viewer.isAuthor && <FollowPill username={article.author.username} initialFollowing={article.viewer.followingAuthor} onPhoto />}
          </span>
          <span className="pointer-events-auto -mr-2 flex items-center">
            <LikeButton like={like} count={stats.likeCount} className={cn(ON_PHOTO, "[&_svg]:text-brand")} />
            <CommentButton article={article} count={stats.commentCount} className={ON_PHOTO} />
            <ShareButton article={article} count={stats.shareCount} className={ON_PHOTO} />
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * One of the two stories beside the carousel (owner 2026-10-10: the words covered the photo): the photo on top, then
 * on white the headline, the reporter with Follow, and like · comment · share.
 */
function SideStory({ article, justIn }: { article: ArticleCard; justIn: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useViewTracking(ref, article.id, !article.viewer.isAuthor);
  const stats = useArticleStats(article);
  const like = useLike(article);
  const linkProps = storyLinkProps(article);
  const image = article.articleImage ?? { url: article.coverUrl, blur: article.coverBlur };
  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card max-md:h-72"
    >
      <Link
        {...linkProps}
        tabIndex={-1}
        aria-hidden
        className="relative block min-h-0 flex-1 overflow-hidden bg-surface-3 bg-cover bg-center"
        style={image.blur ? { backgroundImage: `url(${image.blur})` } : undefined}
      >
        {image.url && (
          <img
            src={image.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        {article.premium && <PremiumCorner />}
        {justIn && (
          <span className="absolute right-3 top-3 flex flex-wrap gap-1.5">
            <JustInBadge />
          </span>
        )}
      </Link>
      <div className="flex shrink-0 flex-col gap-1.5 px-3.5 pb-1.5 pt-2.5">
        <h2 id={titleId} dir="auto" className={cn("line-clamp-2 text-[0.9375rem] font-extrabold leading-snug text-ink", hasIndicScript(article.title) && INDIC_HEADLINE)}>
          <Link {...linkProps} className="rounded-sm outline-offset-2 transition-colors hover:text-brand">
            {article.title}
          </Link>
        </h2>
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/${article.author.username}`} className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Avatar src={article.author.image} name={article.author.name} size={22} decorative />
            <span className="truncate font-semibold text-ink-2">{article.author.name}</span>
            <ReporterMark level={article.badges?.reporterLevel ?? null} size={13} focusable={false} />
            <TimeAgo date={article.publishedAt} className="shrink-0" />
          </Link>
          {!article.viewer.isAuthor && <FollowPill username={article.author.username} initialFollowing={article.viewer.followingAuthor} />}
          <span className="-mr-1.5 ml-auto flex shrink-0 items-center">
            <LikeButton like={like} count={stats.likeCount} className={cn(ON_CARD, "[&_svg]:text-brand")} />
            <CommentButton article={article} count={stats.commentCount} className={ON_CARD} />
            <ShareButton article={article} count={stats.shareCount} className={ON_CARD} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** A "Latest stories" card: the photo with the section badge, the headline, the reporter, like · comment · share. */
export function StoryTile({ article, justIn }: { article: ArticleCard; justIn: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useViewTracking(ref, article.id, !article.viewer.isAuthor);
  const stats = useArticleStats(article);
  const like = useLike(article);
  const linkProps = storyLinkProps(article);
  const image = article.articleImage ?? { url: article.coverUrl, blur: article.coverBlur };
  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      <Link
        {...linkProps}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-16/10 overflow-hidden bg-surface-3 bg-cover bg-center"
        style={image.blur ? { backgroundImage: `url(${image.blur})` } : undefined}
      >
        {image.url && (
          <img
            src={image.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {justIn && <JustInBadge />}
        </span>
        {/* Members-only: the diamond in the top-left corner (owner 2026-10-15). */}
        {article.premium && <PremiumCorner />}
      </Link>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 id={titleId} dir="auto" className={cn("line-clamp-3 text-[0.9375rem] font-extrabold leading-snug text-ink", hasIndicScript(article.title) && INDIC_HEADLINE)}>
          <Link {...linkProps} className="rounded-sm outline-offset-2 transition-colors hover:text-brand">
            {article.title}
          </Link>
        </h3>
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/${article.author.username}`} className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <Avatar src={article.author.image} name={article.author.name} size={24} decorative />
            <span className="truncate font-semibold text-ink-2">{article.author.name}</span>
            <ReporterMark level={article.badges?.reporterLevel ?? null} size={13} focusable={false} />
            <TimeAgo date={article.publishedAt} className="shrink-0" />
          </Link>
          {!article.viewer.isAuthor && (
            <FollowPill username={article.author.username} initialFollowing={article.viewer.followingAuthor} className="ml-auto" />
          )}
        </div>
        <div className="-ml-1.5 mt-auto flex items-center pt-1">
          <LikeButton like={like} count={stats.likeCount} className={cn(ON_CARD, "[&_svg]:text-brand")} />
          <CommentButton article={article} count={stats.commentCount} className={ON_CARD} />
          <ShareButton article={article} count={stats.shareCount} className={ON_CARD} />
          {/* ⋮ on every card (owner 2026-10-15). */}
          <span className="ml-auto">
            <CardMenu article={article} />
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Follow / Following beside the reporter (owner 2026-10-10); following shows the bell menu — All / None / Unfollow
 * (owner 2026-10-16), opened straight after a follow. Hidden on your own stories.
 */
export function FollowPill({ username, initialFollowing, onPhoto = false, className }: { username: string; initialFollowing: boolean; onPhoto?: boolean; className?: string }) {
  const base =
    "relative inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors after:absolute after:-inset-1.5 after:content-[''] active:scale-95";
  return (
    <FollowControl
      username={username}
      initialFollowing={initialFollowing}
      followClassName={cn(base, onPhoto ? "border-white/90 bg-white/10 text-white hover:bg-white/25" : "border-brand/70 text-brand hover:bg-tint", className)}
      followingClassName={cn(base, "px-2.5", onPhoto ? "border-white/50 text-white/90 hover:bg-white/10" : "border-border-strong text-ink-2 hover:bg-surface-2", className)}
      iconClassName="size-3.5"
    />
  );
}

export function StoryTileSkeleton() {
  return (
    <div aria-hidden className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="skeleton aspect-16/10 rounded-none" />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="skeleton h-4 w-full rounded-sm" />
        <div className="skeleton h-4 w-3/4 rounded-sm" />
        <div className="skeleton h-3 w-1/2 rounded-sm" />
      </div>
    </div>
  );
}

/** The loading placeholder in the same shape: the top section, then a row of cards. */
export function DesktopFeedSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className={cn("skeleton rounded-3xl", TOP_H)} />
        <div className="grid gap-4 max-md:hidden md:grid-rows-2">
          <div className="skeleton rounded-2xl" />
          <div className="skeleton rounded-2xl" />
        </div>
      </div>
      <div className={TILE_GRID}>
        {Array.from({ length: 4 }, (_, i) => (
          <StoryTileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Home: from people you follow ─────────────────────────── */

/** How many of the newest followed stories the Home carousel loops through. */
const FOLLOWING_HERO = 8;

function FollowingHero({ justIn }: { justIn: ReadonlySet<string> }) {
  const viewer = useViewer();
  const following = useQuery({
    queryKey: ["feed-hero", "following"],
    queryFn: ({ signal }) => api.feed({ tab: "following" }, signal),
    enabled: Boolean(viewer),
    staleTime: 60_000,
  });
  const items = (following.data?.items ?? []).slice(0, FOLLOWING_HERO);

  if (viewer && following.isPending) return <div aria-hidden className={cn("animate-pulse rounded-3xl bg-surface-2", TOP_H)} />;
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="following-hero-empty"
        className={cn("relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-ink px-6 text-center text-white shadow-card", TOP_H)}
      >
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(227_6_19/0.45),transparent_55%)]" />
        <span aria-hidden className="relative flex size-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
          <Users className="size-7" />
        </span>
        <h2 id="following-hero-empty" className="relative font-wide text-2xl font-black tracking-tight sm:text-3xl">
          Follow reporters to see their latest stories
        </h2>
        <p className="relative max-w-md text-sm text-white/75">
          {viewer
            ? "The newest stories from the reporters you follow play here, one after another."
            : "Log in and follow reporters — their newest stories play here, one after another."}
        </p>
        <Button href={viewer ? "/explore" : "/login"} className="relative mt-1">
          {viewer ? "Find reporters to follow" : "Log in"}
        </Button>
      </section>
    );
  }
  return (
    <section aria-label="From reporters you follow">
      <HeroCarousel items={items} justIn={justIn} label="From reporters you follow" />
    </section>
  );
}
