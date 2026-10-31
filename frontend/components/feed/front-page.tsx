"use client";

import { Eye } from "lucide-react";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { showPendingPage } from "@/components/layout/pending-page";
import { Avatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import { formatNumber } from "@/lib/format";
import { type ArticleCard, type Wish } from "@/lib/shared/contracts";
import { openStoryHref, storyHref, storyLinkProps } from "@/lib/story-link";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { LockedGridCard } from "@/components/auth/read-wall";
import { CommentButton } from "./comment-button";
import { FollowPill } from "./desktop-feed";
import { LikeButton } from "./like-button";
import { useArticleStats } from "./live-state";
import { CardMenu } from "./phone-story-card";
import { PremiumCorner } from "./premium";
import { hasIndicScript, INDIC_HEADLINE } from "./script";
import { ShareButton } from "./share-button";
import { DOUBLE_TAP_MS, HeartPop } from "./story-cover";
import { ReporterMark, SpotlightedTag } from "./story-badges";
import { useLike } from "./use-like";
import { useViewTracking } from "./view-tracker";
import { FeedWish, type FeedEntry } from "@/components/wishes/feed-wishes";

/*
 * Home and every feed on tablets and computers (owner 2026-10-16): news cards in a grid, newspaper style — the article
 * image with 👁 views · time on it, the headline, the blurb, then the reporter + Follow and like · comment · share at the
 * card's foot — with thin lines between the columns. (The reel rows between them became cards too.) Phones keep their
 * posts (phone-story-card.tsx).
 */

/** like · comment · share with their counts. */
const ACTION = "h-8 px-1.5 text-muted hover:bg-surface-2 hover:text-ink";

/** The cards show the story's COVER image (owner 2026-10-15), the article image only when there's no cover. */
function photo(article: ArticleCard) {
  return article.coverUrl
    ? { url: article.coverUrl, blur: article.coverBlur }
    : (article.articleImage ?? { url: "", blur: null });
}

/** Grid columns for the feed's width: as many ~320px cards as fit, 2–4. */
function columnsFor(width: number): number {
  if (width >= 1380) return 4;
  if (width >= 960) return 3;
  return 2;
}

/** Watches the feed's width; the rows are cut to whole rows of its columns. */
function useColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumns(columnsFor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, columns] as const;
}

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function FrontPage({
  items,
  locked = [],
  justIn,
  loadingMore,
  weave,
}: {
  items: ArticleCard[];
  /** Slots birthday wishes & invitations in between the stories (owner 2026-10-31; feed-wishes.tsx). */
  weave?: (items: ArticleCard[]) => FeedEntry<ArticleCard>[];
  /**
   * A visitor's stories past the free ones (read-wall.tsx): the same cards, blurred under "Sign in to read", carrying
   * straight on in the grid after `items` (owner 2026-10-22: "don't break — continue the cards till the end").
   */
  locked?: ArticleCard[];
  justIn: ReadonlySet<string>;
  loadingMore: boolean;
  ended?: boolean;
  sections?: boolean;
}) {
  const [ref, columns] = useColumns();
  const lockedIds = new Set(locked.map((article) => article.id));
  // Every story as a news card (owner 2026-10-16: the reel rows between the cards became cards too — article image,
  // headline, blurb, the reporter row), in one grid with thin lines between the columns.
  const all = [...items, ...locked];
  const blocks: { kind: "grid" | "reels"; items: ArticleCard[] }[] = all.length > 0 ? [{ kind: "grid", items: all }] : [];
  const cells: (ArticleCard | Wish)[] = weave
    ? [...weave(items).map((entry) => (entry.kind === "story" ? entry.item : entry.wish)), ...locked]
    : all;
  const isWish = (cell: ArticleCard | Wish): cell is Wish => "kind" in cell && (cell.kind === "birthday" || cell.kind === "invitation");
  const reelSize = columns + 2;
  return (
    <div ref={ref} className="flex flex-col gap-12">
      {blocks.map((block, index) =>
        block.kind === "grid" ? (
          <ol
            key={block.items[0]!.id}
            className={cn("-mx-6 grid gap-y-10", GRID_COLS[columns])}
          >
            {cells.map((article, i) => (
              <li
                key={isWish(article) ? `wish-${article.id}` : article.id}
                // Locked cards and wishes aren't feed items: News radio and the view counter leave them alone.
                data-feed-item={isWish(article) || lockedIds.has(article.id) ? undefined : article.id}
                // A thin line between the columns (owner 2026-10-16 reference), none after the last of a row.
                className={cn(
                  // The same padding on every column (equal widths, so every photo is the same height); the row hangs
                  // out by it on both sides (-mx-6), so the outer columns still line up with the page.
                  "relative min-w-0 px-6",
                  i % columns !== columns - 1 && "border-r border-border",
                  // A dark rule across the page between two rows of cards (owner 2026-10-16 reference), drawn per card
                  // and joined across the row; it stops at the page's edges (not the hanging padding).
                  i >= columns &&
                    "pt-10 before:absolute before:top-0 before:h-0.5 before:bg-ink before:content-['']",
                  i >= columns && (i % columns === 0 ? "before:left-6 before:right-0" : i % columns === columns - 1 ? "before:left-0 before:right-6" : "before:inset-x-0"),
                  !isWish(article) && justIn.has(article.id) && "animate-pop-in",
                )}
              >
                {isWish(article) ? (
                  <FeedWish wish={article} />
                ) : lockedIds.has(article.id) ? (
                  <LockedGridCard article={article} />
                ) : (
                  <GridCard article={article} priority={index === 0} />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <ReelShelf
            key={block.items[0]!.id}
            items={block.items}
            slots={reelSize}
          />
        ),
      )}
      {loadingMore && <SkeletonGrid columns={columns} rows={1} />}
    </div>
  );
}

/**
 * The grid's own skeleton (owner 2026-10-22: "show the existing structure while loading"): the same columns, the thin
 * lines between them and the dark rule between rows, each cell a card's outline — photo, headline, blurb, the
 * reporter row. `FrontPageSkeleton` measures its width like the real grid; `SkeletonGrid` takes the columns it's given.
 */
export function FrontPageSkeleton({ rows = 2 }: { rows?: number }) {
  const [ref, columns] = useColumns();
  return (
    <div ref={ref} className="flex flex-col gap-12">
      <SkeletonGrid columns={columns} rows={rows} />
    </div>
  );
}

function SkeletonGrid({ columns, rows }: { columns: number; rows: number }) {
  return (
    <ol aria-hidden className={cn("-mx-6 grid gap-y-10", GRID_COLS[columns])}>
      {Array.from({ length: columns * rows }, (_, i) => (
        <li
          key={i}
          className={cn(
            "relative min-w-0 px-6",
            i % columns !== columns - 1 && "border-r border-border",
            i >= columns && "pt-10 before:absolute before:top-0 before:h-0.5 before:bg-ink before:content-['']",
            i >= columns && (i % columns === 0 ? "before:left-6 before:right-0" : i % columns === columns - 1 ? "before:left-0 before:right-6" : "before:inset-x-0"),
          )}
        >
          <GridCardSkeleton />
        </li>
      ))}
    </ol>
  );
}

/**
 * A story card, newspaper style (owner 2026-10-16 reference): the photo (square corners) with 👁 views · time in its
 * corner, the headline (⋯ beside it; no section name), the blurb, then one row: the reporter + Follow on the left,
 * like · comment · share on the right. Thin lines between the columns (FrontPage).
 */
function GridCard({ article, priority }: { article: ArticleCard; priority: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const stats = useArticleStats(article);
  useViewTracking(ref, article.id, !article.viewer.isAuthor);
  return (
    <article ref={ref} aria-labelledby={titleId} className="flex h-full flex-col gap-3">
      <div className="relative">
        <Thumb article={article} articleImage eager={priority} className="aspect-video w-full rounded-none" />
        {/* 👁 views · time on the photo — "Spotlighted" in the time's place while a boost runs. */}
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          <Views count={stats.viewCount} />
          <span aria-hidden className="text-white/60">·</span>
          {article.badges?.spotlight ? <SpotlightedTag /> : <TimeAgo date={article.publishedAt} className="shrink-0" />}
        </span>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Headline article={article} id={titleId} className="line-clamp-2 text-[1.125rem] font-semibold leading-[1.45] text-ink" />
        </div>
        <span className="-mr-1.5 shrink-0">
          <CardMenu article={article} compact />
        </span>
      </div>
      {article.excerpt && <p className="line-clamp-3 text-[0.9375rem] leading-[1.7] text-muted">{article.excerpt}</p>}
      {/* At the card's foot, on one line in every card of the row (owner 2026-10-16): a long name shortens with "…". */}
      <div className="mt-auto flex min-w-0 items-center gap-2 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href={`/${article.author.username}`}
            className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-2 hover:text-ink"
          >
            <Avatar src={article.author.image} name={article.author.name} size={26} decorative className="shrink-0 ring-1 ring-border" />
            <span className="truncate">{article.author.name}</span>
            <ReporterMark level={article.badges?.reporterLevel ?? null} size={13} focusable={false} />
          </Link>
          {!article.viewer.isAuthor && (
            <FollowPill
              username={article.author.username}
              initialFollowing={article.viewer.followingAuthor}
              className="h-6 shrink-0 gap-1 px-2.5 text-[0.6875rem] [&_svg]:size-3"
            />
          )}
        </div>
        <div className="ml-auto shrink-0">
          <ActionRow article={article} compact />
        </div>
      </div>
    </article>
  );
}

/** A card's outline (GridCard's shape): the 16:9 photo, two headline lines, three blurb lines, the reporter row. */
function GridCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="skeleton aspect-video w-full rounded-none" />
      <div className="mt-2 flex flex-col gap-2">
        <div className="skeleton h-[1.125rem] w-11/12 rounded-sm" />
        <div className="skeleton h-[1.125rem] w-3/4 rounded-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="skeleton h-3.5 w-full rounded-sm" />
        <div className="skeleton h-3.5 w-full rounded-sm" />
        <div className="skeleton h-3.5 w-2/3 rounded-sm" />
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <div className="skeleton size-6.5 shrink-0 rounded-full" />
        <div className="skeleton h-3.5 w-24 rounded-sm" />
        <div className="skeleton h-6 w-16 rounded-full" />
        <div className="ml-auto flex items-center gap-3">
          <div className="skeleton size-4 rounded-full" />
          <div className="skeleton size-4 rounded-full" />
          <div className="skeleton size-4 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** 👁 and the view count (owner 2026-10-16). */
function Views({ count }: { count: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      title={`${formatNumber(count)} views`}
    >
      <Eye aria-hidden className="size-3.5" strokeWidth={2} />
      <span className="tabular-nums">{formatNumber(count)}</span>
      <span className="sr-only"> views</span>
    </span>
  );
}

/** One row of reels (like YouTube's Shorts row): tall covers with the headline and views under each. */
function ReelShelf({ items, slots }: { items: ArticleCard[]; slots: number }) {
  return (
    <section aria-label="Reels" className="border-y border-border py-10">
      {/* Always sized for a full row (owner 2026-10-16): a short row — the last few stories — keeps small reel cards
          instead of stretching a few across the whole width. */}
      <ol
        className="no-scrollbar grid gap-5 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(9rem, 1fr))` }}
      >
        {items.map((article) => (
          <li key={article.id} data-feed-item={article.id} className="min-w-0">
            <ReelCard article={article} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A reel in the row, laid out like the story cards (owner 2026-10-16): views on the cover, headline, blurb, one row. */
function ReelCard({ article }: { article: ArticleCard }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const stats = useArticleStats(article);
  useViewTracking(ref, article.id, !article.viewer.isAuthor);
  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      className="flex h-full flex-col gap-2.5"
    >
      <div className="relative">
        {/* The cover only (owner 2026-10-16), never the article image. */}
        <Thumb
          article={article}
          coverOnly
          className="aspect-[9/16] w-full rounded-none"
        />
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          <Views count={stats.viewCount} />
          <span aria-hidden className="text-white/60">
            ·
          </span>
          {article.badges?.spotlight ? (
            <SpotlightedTag />
          ) : (
            <TimeAgo date={article.publishedAt} className="shrink-0" />
          )}
        </span>
      </div>
      <Headline
        article={article}
        id={titleId}
        className="line-clamp-2 text-sm font-bold leading-snug text-ink"
      />
      {article.excerpt && (
        <p className="-mt-1 line-clamp-2 text-xs leading-snug text-muted">
          {article.excerpt}
        </p>
      )}
      {/* One row: the reporter + Follow, then like · comment · share. */}
      {/* The card's foot, lined up across the row (owner 2026-10-16): a reel is narrow, so the reporter + Follow on one
          line (a long name shortens with "…") and like · comment · share under it. */}
      <div className="mt-auto flex min-w-0 flex-col gap-1 pt-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={`/${article.author.username}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
          >
            <Avatar src={article.author.image} name={article.author.name} size={22} decorative className="shrink-0 ring-1 ring-border" />
            <span className="truncate">{article.author.name}</span>
            <ReporterMark level={article.badges?.reporterLevel ?? null} size={12} focusable={false} />
          </Link>
          {!article.viewer.isAuthor && (
            <FollowPill
              username={article.author.username}
              initialFollowing={article.viewer.followingAuthor}
              className="h-6 shrink-0 gap-1 px-2.5 text-[0.6875rem] [&_svg]:size-3"
            />
          )}
        </div>
        <div className="-ml-1.5">
          <ActionRow article={article} compact />
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── The reporter row ─────────────────────────── */

/** like · comment · share with counts (a card's foot). */
function ActionRow({
  article,
  compact = false,
}: {
  article: ArticleCard;
  compact?: boolean;
}) {
  const stats = useArticleStats(article);
  const like = useLike(article);
  return (
    <div
      className={cn(
        "flex items-center",
        compact ? "-mr-1.5 [&>*]:px-1 [&_svg]:size-4" : "-mx-1.5",
      )}
    >
      <LikeButton
        like={like}
        count={stats.likeCount}
        className={cn(ACTION, "[&_svg]:text-brand")}
      />
      <CommentButton
        article={article}
        count={stats.commentCount}
        className={ACTION}
      />
      <ShareButton
        article={article}
        count={stats.shareCount}
        className={ACTION}
      />
    </div>
  );
}

function Thumb({
  article,
  className,
  eager = false,
  articleImage = false,
  coverOnly = false,
}: {
  article: ArticleCard;
  className: string;
  eager?: boolean;
  /** The article image first (the featured story, owner 2026-10-15), the cover as its fallback. */
  articleImage?: boolean;
  /** The cover and nothing else (the reels row, owner 2026-10-16); the branded tile when there's none. */
  coverOnly?: boolean;
}) {
  const image =
    articleImage && article.articleImage?.url
      ? article.articleImage
      : photo(article);
  // Every photo box is filled (owner 2026-10-15): the cover, else the article image, else a branded tile — never an
  // empty box when a picture is missing or fails to load.
  const sources = (
    coverOnly
      ? [article.coverUrl]
      : [image.url, article.articleImage?.url, article.coverUrl]
  ).filter(
    (src, index, all): src is string =>
      Boolean(src) && all.indexOf(src) === index,
  );
  const [failed, setFailed] = useState(0);
  const src = sources[failed];

  // Double-click / double-tap the photo to like it (owner 2026-10-16), with the big heart; a single click still opens
  // the story once the double-click window has passed.
  const router = useRouter();
  const like = useLike(article);
  const [heart, setHeart] = useState(0);
  const lastClick = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    [],
  );
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    if (event.timeStamp - lastClick.current < DOUBLE_TAP_MS) {
      lastClick.current = 0;
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = null;
      setHeart((n) => n + 1);
      like.like();
      track("double_tap_like", { articleId: article.id });
      return;
    }
    lastClick.current = event.timeStamp;
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      openStoryHref(
        storyHref(article),
        (path) => {
          showPendingPage(path);
          router.push(path);
        },
        true,
      );
    }, DOUBLE_TAP_MS);
  };

  return (
    <Link
      {...storyLinkProps(article)}
      onClick={onClick}
      // It opens the story itself after the double-tap window (and shows the skeleton then), never on a like.
      data-own-pending=""
      tabIndex={-1}
      aria-hidden
      className={cn(
        "group/img relative block shrink-0 overflow-hidden bg-tint bg-cover bg-center",
        className,
      )}
      style={
        (coverOnly ? article.coverBlur : image.blur)
          ? {
              backgroundImage: `url(${coverOnly ? article.coverBlur : image.blur})`,
            }
          : undefined
      }
    >
      {/* Members-only: the red diamond on the photo (owner 2026-10-15). */}
      {article.premium && <PremiumCorner size={30} />}
      {src ? (
        <>
          {/* Every box is 9:16 like the covers (owner 2026-10-15), so the cover fills it exactly. */}
          <img
            key={src}
            src={src}
            alt=""
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : undefined}
            decoding="async"
            draggable={false}
            onError={() => setFailed((n) => n + 1)}
            className="absolute inset-0 size-full object-cover object-center transition-transform duration-500 group-hover/img:scale-[1.03]"
          />
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-tint">
          <SpeedBarsSvg className="w-[22%] max-w-16 text-brand/70" />
        </span>
      )}
      <HeartPop beat={heart} onDone={() => setHeart(0)} />
    </Link>
  );
}

function Headline({
  article,
  id,
  className,
}: {
  article: ArticleCard;
  id?: string;
  className: string;
}) {
  return (
    <h3
      id={id}
      dir="auto"
      className={cn(className, hasIndicScript(article.title) && INDIC_HEADLINE)}
    >
      <Link
        {...storyLinkProps(article)}
        className="rounded-sm outline-offset-2 transition-colors hover:text-brand"
      >
        {article.title}
      </Link>
    </h3>
  );
}

/* ─────────────────────────── Under a story ─────────────────────────── */
