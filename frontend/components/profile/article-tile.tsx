"use client";

import { ArrowUpRight, Clock3, Eye, MessageSquareWarning, PenLine, Play } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { PremiumCorner } from "@/components/feed/premium";
import { StoryPoster, toPosterStory } from "@/components/poster/story-poster";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { StoryMenu } from "@/components/feed/story-menu";
import { compactNumber } from "@/lib/format";
import type { ArticleCard, DraftCard } from "@/lib/shared/contracts";
import { storyLinkProps } from "@/lib/story-link";
import { cn } from "@/lib/utils";

/*
 * Profile grid tiles (SPEC §3.7). Published stories are their 9:16 posters with the views and the ⋮ menu (redesign
 * 2026-10-07). Draft tiles are 9:16 covers with the headline overlaid on a soft bottom gradient
 * (legibility only — the tile itself is never a dark surface), carry a DRAFT stamp and open the composer.
 */

/** Focus ring = the global red :focus-visible outline, pushed off the sliced frame. */
const LINK = "group relative block rounded-xl focus-visible:outline-offset-3";
const FRAME = "relative aspect-9/16 overflow-hidden rounded-xl sm:rounded-2xl";
const COVER =
  "absolute inset-0 size-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-106 group-focus-visible:scale-106 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100";
/** Hover/focus reveal that stays on for devices without hover. */
const REVEAL =
  "opacity-0 transition-[opacity,transform] duration-200 ease-snap group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100";

function blurStyle(blur: string | null): CSSProperties | undefined {
  return blur ? { backgroundImage: `url("${blur}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;
}

/** Soft bottom gradient: only as tall as the headline block needs, so most of the cover stays clear. */
const SCRIM = "pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-ink/75 via-ink/25 via-55% to-transparent";

/** Crimson bar that slides in along the bottom edge on hover/focus. */
function HoverRule() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-0.75 origin-left scale-x-0 bg-brand transition-transform duration-300 ease-snap group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
    />
  );
}

export type ArticleTileProps = {
  article: ArticleCard;
  /** Arrived via realtime: NEW badge + a red flash that fades. */
  isNew?: boolean;
  /** Eager-load (first row). */
  priority?: boolean;
  /** The ⋮ menu opens to the right in the grid's first column, else to the left (keeps it on screen). */
  menuAlign?: "start" | "end";
};

/**
 * A published story as its 9:16 poster (redesign 2026-10-07, like Instagram's grid; before: a small card with the
 * cover, category and headline — owner 2026-09-28): the poster as published, its views at the bottom left (a play
 * mark for a video), "Hidden" / "New" at the top left and the ⋮ story menu at the top right. The whole tile opens the
 * story; the menu sits above the link.
 */
export function ArticleTile({ article, isNew = false, priority = false, menuAlign = "end" }: ArticleTileProps) {
  return (
    <article className="group relative" data-testid="profile-tile">
      <Link
        {...storyLinkProps(article)}
        aria-label={article.title}
        className="relative block overflow-hidden rounded-xl focus-visible:outline-offset-2 sm:rounded-2xl"
      >
        <div aria-hidden className="transition-transform duration-500 ease-out-expo group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          {/* content-visibility: tiles far off screen skip layout and paint. */}
          <StoryPoster
            template={article.template}
            story={{ ...toPosterStory(article), videoUrl: null }}
            priority={priority}
            className="[content-visibility:auto]"
          />
        </div>
        {/* Members-only stories always show their headline (owner 2026-10-15) — even on the photo-only design. */}
        {article.premium && article.template === "plain" && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-3/5 items-end bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pb-9 sm:pb-10"
          >
            <span dir="auto" className="line-clamp-3 font-wide text-[0.9375rem] font-extrabold leading-snug text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.5)] sm:text-lg">
              {article.title}
            </span>
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/4 items-end bg-linear-to-t from-black/55 to-transparent p-2 sm:p-2.5"
        >
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)] sm:text-xs">
            {article.video ? <Play className="size-3 fill-current" /> : <Eye className="size-3.5" />}
            {compactNumber(article.viewCount)}
          </span>
        </span>
        {isNew && (
          // Realtime arrival: a pink flash with a crimson rim that fades out (opacity only).
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-tint-3 shadow-[inset_0_0_0_3px_var(--brand)]"
            initial={{ opacity: 0.75 }}
            animate={{ opacity: [0.75, 0.75, 0] }}
            transition={{ duration: 2.4, times: [0, 0.35, 1], ease: "easeOut" }}
          />
        )}
      </Link>
      {article.premium && !article.hidden && !isNew && (
        <PremiumCorner size={30} className="rounded-tl-xl sm:rounded-tl-2xl" />
      )}
      {(article.hidden || isNew) && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 sm:left-2 sm:top-2">
          {article.hidden ? (
            <span className="inline-flex items-center rounded-full bg-ink px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.08em] text-white">
              Hidden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.08em] text-brand-contrast">
              <PulseDot size="xs" tone="white" />
              New
            </span>
          )}
        </span>
      )}
      <StoryMenu
        article={article}
        size="xs"
        up={false}
        align={menuAlign}
        className="absolute right-1 top-1 z-10 [&>button]:bg-black/35 [&>button]:text-white [&>button]:hover:bg-black/55 [&>button]:hover:text-white"
      />
    </article>
  );
}

export type DraftTileProps = { draft: DraftCard; priority?: boolean };

export function DraftTile({ draft, priority = false }: DraftTileProps) {
  const title = draft.title?.trim() || "Untitled draft";
  const hasCover = Boolean(draft.coverUrl);
  const titleId = `draft-${draft.id}`;
  const state: "draft" | "in_review" | "returned" = draft.status === "in_review" ? "in_review" : draft.returned ? "returned" : "draft";

  return (
    <Link
      href={`/publish/${draft.id}`}
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-meta`}
      className={LINK}
      data-testid="draft-tile"
      data-state={state}
    >
      <div
        className={cn(FRAME, hasCover ? "bg-surface-2" : "border border-dashed border-tint-border bg-tint")}
        style={hasCover ? blurStyle(draft.coverBlur) : undefined}
      >
        {hasCover && draft.coverUrl ? (
          <>
            <img
              src={draft.coverUrl}
              alt=""
              width={800}
              height={450}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className={cn(COVER, state === "draft" && "saturate-[0.35]")}
            />
            <span aria-hidden className={SCRIM} />
          </>
        ) : (
          <SpeedBarsSvg className="absolute left-1/2 top-[42%] w-14 -translate-x-1/2 -translate-y-1/2 text-tint-3 sm:w-20" />
        )}

        <DeskStamp state={state} />

        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3.5">
          <p
            id={`${titleId}-meta`}
            className={cn(
              "mb-1.5 flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em]",
              hasCover ? "text-white/80" : "text-muted",
            )}
          >
            {state === "in_review" ? (
              <>
                <Clock3 aria-hidden className="size-3" />
                <span>
                  Sent <TimeAgo date={draft.updatedAt} variant="short" />
                </span>
              </>
            ) : state === "returned" ? (
              <>
                <MessageSquareWarning aria-hidden className="size-3" />
                <span>Editor&rsquo;s note</span>
              </>
            ) : (
              <>
                <PenLine aria-hidden className="size-3" />
                <span>
                  Edited <TimeAgo date={draft.updatedAt} variant="short" />
                </span>
              </>
            )}
          </p>
          <h3
            id={titleId}
            className={cn(
              "line-clamp-4 font-wide text-[0.8125rem] font-extrabold leading-[1.18] tracking-[-0.005em] wrap-anywhere sm:text-[0.9375rem]",
              hasCover ? "text-white text-shadow-sm" : "text-ink group-hover:text-brand",
              !draft.title?.trim() && "italic opacity-80",
              state === "returned" && draft.reviewNote && "line-clamp-2",
            )}
          >
            {title}
          </h3>
          {state === "returned" && draft.reviewNote && (
            <p
              className={cn(
                "mt-1.5 line-clamp-2 border-l-2 border-brand pl-2 text-[0.6875rem] font-medium italic leading-snug",
                hasCover ? "text-white/90" : "text-ink-2",
              )}
            >
              <span className="sr-only">Editor&rsquo;s note: </span>
              {draft.reviewNote}
            </p>
          )}
          <p
            aria-hidden
            className={cn(
              "mt-1.5 flex translate-y-1 items-center gap-1 text-[0.6875rem] font-bold",
              hasCover ? "text-white" : "text-brand",
              REVEAL,
            )}
          >
            {state === "returned" ? "Fix and resubmit" : state === "in_review" ? "Open story" : "Continue editing"}{" "}
            <ArrowUpRight className="size-3.5" />
          </p>
        </div>
        <HoverRule />
      </div>
    </Link>
  );
}

/** Rubber stamp: "Draft" (red outline), "In review" (grey), "Returned" (filled red). */
function DeskStamp({ state }: { state: "draft" | "in_review" | "returned" }) {
  return (
    <span
      className={cn(
        "absolute left-2.5 top-3 inline-flex -rotate-8 items-center border-2 px-1.5 py-0.5 font-wider text-[0.6875rem] font-black uppercase leading-none tracking-[0.22em] sm:left-3 sm:top-4 sm:text-xs",
        "outline-1 outline-offset-2 outline-solid",
        state === "draft" && "border-brand bg-surface/90 text-brand shadow-[inset_0_0_0_1px_var(--brand)] outline-brand",
        state === "in_review" && "border-ink-2 bg-surface/95 text-ink-2 outline-ink-2",
        state === "returned" && "border-brand bg-brand text-brand-contrast outline-brand",
      )}
    >
      {state === "in_review" ? "In review" : state === "returned" ? "Returned" : "Draft"}
    </span>
  );
}
