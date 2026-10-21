import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { hasIndicScript, INDIC_HEADLINE } from "@/components/feed/script";
import type { PosterFrame, ReporterLevel } from "@/lib/shared/contracts";
import { cn, initialsOf } from "@/lib/utils";
import { PosterVideo } from "./poster-video";

/*
 * Building blocks shared by the poster designs (templates/*.tsx). Every size is in container units (cqw of the
 * poster's width — StoryPoster's root is the size container), so a design looks the same as a 110px thumbnail and
 * as a full phone screen. 100cqw = the poster's width; its height is 177.78cqw (9:16).
 * No design shows the WebNEWS logo (owner 2026-10-05) — older notes in templates/*.tsx that mention it predate that —
 * only the small, muted three-bar mark in the top left corner (StoryPoster); the author line sits at the bottom left
 * of every design (owner 2026-10-05, later).
 */

/** What a poster shows: the story's image and title, and who wrote it. */
export type PosterStory = {
  title: string;
  imageUrl: string;
  /** Tiny blur data URL painted while the image loads. */
  imageBlur?: string | null;
  /** A video story's clip: it plays in the photo's box (the image is then its poster frame). */
  videoUrl?: string | null;
  /** "Your frame": the reporter's frame image laid over the photo (owner 2026-10-08). */
  overlayUrl?: string | null;
  /** Where the photo sits in its box (set by the reporter in the live preview); null = centred. */
  imageFrame?: PosterFrame | null;
  author: {
    name: string;
    username: string;
    image: string | null;
    reporterLevel?: ReporterLevel | null;
    /** Set → the author line is a link there (feed reels: the author's profile). Unset: plain, as in previews. */
    href?: string | null;
    /**
     * After the name (feed reels and tiles: the "Follow" pill while the reader doesn't follow them — owner 2026-10-07,
     * like Instagram; before: a "+" on the photo). Kept outside the profile link.
     */
    follow?: ReactNode;
  };
};

/** Props every design receives from StoryPoster. */
export type PosterDesignProps = {
  story: PosterStory;
  priority: boolean;
  titleId?: string;
};

/* ─────────────────────────── Image ─────────────────────────── */

export type PosterImageProps = {
  src: string;
  blur?: string | null;
  /** A video story's clip, played in the box instead of the photo (`src` is its poster frame). */
  video?: string | null;
  /** The reporter's placement of the photo in this box (null = centred). */
  frame?: PosterFrame | null;
  priority?: boolean;
  /** Size and position the box (e.g. "absolute inset-0", "h-1/2 shrink-0"). */
  className?: string;
  /** Overlays drawn over the photo (shades, fades). */
  children?: ReactNode;
};

/**
 * The story's photo, cropped to its box (object-cover). The blur data URL is the box's background, so it shows
 * until the photo paints over it. Decorative (empty alt): the title is the poster's text. A video story plays its
 * clip here instead (poster-video.tsx). A `frame` moves the photo in its box (the point x/y of the photo stays on the
 * same point of the box) and zooms it around that point — CSS only, so it is the same at every poster size.
 * `data-poster-image` marks the box for the live preview's photo adjuster.
 */
export function PosterImage({ src, blur, video, frame, priority = false, className, children }: PosterImageProps) {
  const placed = frameStyle(frame);
  return (
    <div
      data-poster-image=""
      className={cn("relative overflow-hidden bg-surface-3 bg-cover bg-center", className)}
      style={blur ? ({ backgroundImage: `url("${blur}")` } as CSSProperties) : undefined}
    >
      {video ? (
        <PosterVideo src={video} poster={src} priority={priority} style={placed} />
      ) : src && (
        <img
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={placed}
        />
      )}
      {children}
    </div>
  );
}

/** object-position + a zoom around the same point (nothing for a centred, unzoomed photo). */
export function frameStyle(frame: PosterFrame | null | undefined): CSSProperties | undefined {
  if (!frame) return undefined;
  const point = `${frame.x}% ${frame.y}%`;
  return {
    objectPosition: point,
    ...(frame.zoom > 1 ? { transform: `scale(${frame.zoom})`, transformOrigin: point } : {}),
  };
}

/* ─────────────────────────── Title ─────────────────────────── */

/** Size steps by headline length (LIMITS.titleMax = 150): ≤ 45, ≤ 80, ≤ 115, longer. */
const TITLE_STEPS = [45, 80, 115] as const;

/** 0 (short) … 3 (long): which of a design's four title sizes to use. */
export function titleStep(title: string): 0 | 1 | 2 | 3 {
  const length = title.trim().length;
  if (length <= TITLE_STEPS[0]) return 0;
  if (length <= TITLE_STEPS[1]) return 1;
  if (length <= TITLE_STEPS[2]) return 2;
  return 3;
}

export type PosterTitleProps = {
  title: string;
  id?: string;
  /**
   * Font size + line clamp per step (short → long), e.g. `["text-[9cqw] line-clamp-4", …]`. Each design picks clamps
   * that fit its box even with the looser Indic leading, so a title never pushes the layout.
   */
  sizes: readonly [string, string, string, string];
  className?: string;
  /** Classes for an inline span around the words, e.g. a highlighter bar behind each line (Highlight). */
  mark?: string;
};

/**
 * The headline: bigger when short, smaller when long, always clamped (ellipsis). Kannada and other Indic scripts get
 * open leading and no negative tracking (components/feed/script.ts); `dir="auto"` keeps RTL scripts right-aligned.
 */
export function PosterTitle({ title, id, sizes, className, mark }: PosterTitleProps) {
  return (
    <p
      id={id}
      dir="auto"
      data-poster-text=""
      className={cn(
        "text-pretty break-words",
        sizes[titleStep(title)],
        className,
        hasIndicScript(title) && INDIC_HEADLINE,
      )}
    >
      {mark ? <span className={mark}>{title}</span> : title}
    </p>
  );
}

/* ─────────────────────────── Author line ─────────────────────────── */

export type PosterBylineProps = {
  author: PosterStory["author"];
  /** `light` = white text on dark grounds, `dark` = ink text on light grounds. */
  tone: "light" | "dark";
  /** Newspaper style: serif italic. */
  italic?: boolean;
  /** Words before the name (e.g. "By"). */
  prefix?: string;
  priority?: boolean;
  className?: string;
};

/**
 * The small author line: round photo (initials behind it, so a missing or broken photo still shows something), the
 * name, and the small Verified badge (static here — posters don't animate) for verified reporters. With
 * `author.href` (owner 2026-09-29) it opens the author's profile; only the photo + name are the link, not the row.
 * It stays out of the tab order: the reel's action rail carries the same author link for keyboards. `author.follow`
 * (feed reels) hangs from the photo, outside the links.
 *
 * Sized in `--bu`, the byline's unit: 1cqw like the rest of the poster (times `--byline-scale`: phones' reels, 1.4), but
 * never below `--byline-floor` (unset: 0) — the home grid's small tiles set a floor so the name stays readable (owner
 * 2026-10-08); shared poster images are unchanged.
 */
export function PosterByline({ author, tone, italic = false, prefix, priority = false, className }: PosterBylineProps) {
  const light = tone === "light";
  /** The photo and the name each link to the profile (two links, so the Follow badge can sit on the photo). */
  const linked = (node: ReactNode, linkClass: string) =>
    author.href ? (
      <Link
        href={author.href}
        // Every reel on screen has one: no profile prefetch per reel.
        prefetch={false}
        tabIndex={-1}
        draggable={false}
        className={linkClass}
      >
        {node}
      </Link>
    ) : (
      node
    );
  const photo = (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-[calc(var(--bu)*6.4)] shrink-0 items-center justify-center overflow-hidden rounded-full",
        light
          ? "bg-white/20 text-white shadow-[0_0_0_0.4cqw_rgb(255_255_255/0.85)]"
          : "bg-tint-2 text-brand shadow-[0_0_0_0.3cqw_var(--border-strong)]",
      )}
    >
      <span className="font-wide text-[length:calc(var(--bu)*2.6)] font-extrabold uppercase leading-none">{initialsOf(author.name)}</span>
      {author.image && (
        <img
          src={author.image}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          // text-transparent + empty alt: a broken photo shows nothing, so the initials stay visible.
          className="absolute inset-0 size-full object-cover text-transparent"
        />
      )}
    </span>
  );
  const name = (
    <span className="flex min-w-0 items-center gap-[calc(var(--bu)*1.6)]">
      <span
        className={cn(
          "min-w-0 truncate text-[length:calc(var(--bu)*3.6)] leading-[1.25]",
          light ? "text-white/90" : "text-ink",
          italic ? "font-serif font-medium italic" : "font-semibold",
        )}
      >
        {prefix ? `${prefix} ` : null}
        <bdi>{author.name}</bdi>
      </span>
      {author.reporterLevel === "verified" && (
        <VerifiedBadge
          size={14}
          animate={false}
          tooltip={false}
          highlight={false}
          label=""
          // The badge sizes itself in px; the poster sizes it in cqw (the svg follows its box).
          className="-ml-[calc(var(--bu)*0.8)] size-[calc(var(--bu)*3.6)]! [&>svg]:size-full"
        />
      )}
    </span>
  );
  return (
    <div
      data-poster-text=""
      // Always one line, the same on every poster (owner 2026-10-08): photo · name · badge · Follow; a long name is
      // the one that gives way (…).
      // --byline-scale (unset: 1): phones' reels make the byline bigger (globals.css, owner 2026-10-09: "not visible").
      className={cn(
        "flex w-full min-w-0 items-center gap-[calc(var(--bu)*1.8)] [--bu:max(var(--byline-floor,0px),calc(1cqw*var(--byline-scale,1)))]",
        className,
      )}
    >
      <span className="relative flex shrink-0">{linked(photo, "flex rounded-full")}</span>
      {linked(
        name,
        cn("flex min-w-0 items-center hover:[&>span>span:first-child]:underline", light ? "decoration-white/70" : "decoration-ink/40"),
      )}
      {/* Follow, after the name (owner 2026-10-07, like Instagram), in the byline's colour. */}
      {author.follow && <span className={cn("flex shrink-0", light ? "text-white" : "text-ink")}>{author.follow}</span>}
    </div>
  );
}
