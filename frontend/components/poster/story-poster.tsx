import type { ComponentType } from "react";
import {
  DEFAULT_POSTER_TEMPLATE,
  isPosterTemplate,
  POSTER_TEMPLATE_LABELS,
  POSTER_TEMPLATE_VALUES,
  type ArticleCard,
  type PosterTemplate,
} from "@/lib/shared/contracts";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";
import type { PosterDesignProps, PosterStory } from "./poster-parts";
import { BoldTypePoster } from "./templates/bold-type";
import { BreakingPoster } from "./templates/breaking";
import { BroadcastPoster } from "./templates/broadcast";
import { CardPoster } from "./templates/card";
import { ClassicPoster } from "./templates/classic";
import { FullBleedPoster } from "./templates/full-bleed";
import { GlassPoster } from "./templates/glass";
import { HighlightPoster } from "./templates/highlight";
import { MagazinePoster } from "./templates/magazine";
import { OwnFramePoster } from "./templates/own-frame";
import { PlainPoster } from "./templates/plain";
import { QuotePoster } from "./templates/quote";
import { RedFadePoster } from "./templates/red-fade";
import { RedFramePoster } from "./templates/red-frame";
import { RedBandPoster } from "./templates/red-band";
import { SlantPoster } from "./templates/slant";
import { SplitPoster } from "./templates/split";
import { TickerPoster } from "./templates/ticker";
import { TopLinePoster } from "./templates/top-line";

export type { PosterStory } from "./poster-parts";

/** One component per template (each design lives in templates/<value>.tsx). */
const DESIGNS: Record<PosterTemplate, ComponentType<PosterDesignProps>> = {
  plain: PlainPoster,
  "own-frame": OwnFramePoster,
  classic: ClassicPoster,
  "full-bleed": FullBleedPoster,
  "red-band": RedBandPoster,
  split: SplitPoster,
  slant: SlantPoster,
  breaking: BreakingPoster,
  magazine: MagazinePoster,
  broadcast: BroadcastPoster,
  "bold-type": BoldTypePoster,
  "top-line": TopLinePoster,
  card: CardPoster,
  "red-frame": RedFramePoster,
  ticker: TickerPoster,
  quote: QuotePoster,
  highlight: HighlightPoster,
  glass: GlassPoster,
  "red-fade": RedFadePoster,
};

const DESCRIPTIONS: Record<PosterTemplate, string> = {
  plain: "Your cover as it is, with no design or headline over it — just your name and Follow at the bottom.",
  "own-frame": "Your own frame over your cover — upload it once, it stays here for every story.",
  classic: "The photo on top, then the headline on a red-to-black gradient.",
  "full-bleed": "The photo fills the poster; the headline rises out of a dark fade.",
  "red-band": "White poster with a rounded photo and the headline in a red band.",
  split: "Photo on the top half, a big white headline on the black half below.",
  slant: "Full photo crossed by a red slanted block with the headline.",
  breaking: "Full photo with the white headline in a dark box at the bottom.",
  magazine: "A magazine cover: full photo and a big serif headline.",
  broadcast: "A TV news frame: the headline on a white lower-third bar.",
  "bold-type": "Type first: the photo with a slanted edge, then a huge black headline on white below it.",
  "top-line": "Full photo; a short red line over a big white headline at the bottom.",
  card: "Full photo with the headline on a floating white card near the bottom.",
  "red-frame": "Full photo inside a thin red frame and a big white headline.",
  ticker: "Full photo, the headline on a full-width red bar above a dark strip with the author.",
  quote: "Full photo with a big red quote mark and the headline as an italic pull quote.",
  highlight: "Full photo; each line of the headline sits on its own white highlighter bar.",
  glass: "Full photo with the white headline on a frosted-glass panel near the bottom.",
  "red-fade": "Full photo fading into WebNEWS red at the bottom, with a big white headline.",
};

/**
 * Designs whose photo fills the whole 9:16 poster, so a tall 9:16 photo shows
 * in full — the picker tags them "9:16" (owner 2026-10-02).
 */
const FITS_TALL: ReadonlySet<PosterTemplate> = new Set<PosterTemplate>([
  "plain",
  "own-frame",
  "full-bleed",
  "slant",
  "breaking",
  "magazine",
  "broadcast",
  "top-line",
  "card",
  "red-frame",
  "ticker",
  "quote",
  "highlight",
  "glass",
  "red-fade",
]);

/** Every template in POSTER_TEMPLATE_VALUES order, for pickers (publish form) and galleries. */
export const POSTER_TEMPLATES: readonly { value: PosterTemplate; label: string; description: string; fitsTall: boolean }[] =
  POSTER_TEMPLATE_VALUES.map((value) => ({
    value,
    label: POSTER_TEMPLATE_LABELS[value],
    description: DESCRIPTIONS[value],
    fitsTall: FITS_TALL.has(value),
  }));

/** A feed / API story as poster content (cover = its image; a video story also brings its clip, which plays). */
export function toPosterStory(article: ArticleCard): PosterStory {
  return {
    title: article.title,
    imageUrl: article.coverUrl,
    imageBlur: article.coverBlur,
    videoUrl: article.video?.url ?? null,
    imageFrame: article.posterFrame ?? null,
    overlayUrl: article.posterOverlayUrl ?? null,
    author: {
      name: article.author.name,
      username: article.author.username,
      image: article.author.image,
      reporterLevel: article.badges?.reporterLevel ?? null,
    },
  };
}

export type StoryPosterProps = {
  /** The story's design; null / missing / unknown = DEFAULT_POSTER_TEMPLATE ("classic"). */
  template?: PosterTemplate | null;
  story: PosterStory;
  /** Eager, high-priority photo (the first reel on screen). */
  priority?: boolean;
  /** Extra classes on the root (corner radius, shadow, border…). The root already clips its content. */
  className?: string;
  /** `id` for the headline element, so a wrapping card can point `aria-labelledby` at it. */
  titleId?: string;
  /** The small WebNEWS mark in the top left corner (poster images that are shared or auto-posted). */
  mark?: boolean;
};

/**
 * The small WebNEWS three-bar mark in a design's top left corner — only on the poster images that leave WebNEWS
 * (shares, auto-posts: `mark`), not on screen, where a phone's full-screen reel crops the poster's sides (owner
 * 2026-10-05). Muted, never highlighted. Where a design has text or a frame up there, it lines up with its margin.
 */
const MARK_PLACE: Partial<Record<PosterTemplate, string>> = {
  "red-band": "left-[6cqw] top-[2.6cqw]",
  "top-line": "left-[6cqw] top-[3.5cqw]",
  "red-frame": "left-[7.5cqw] top-[7cqw]",
};
/** Designs that are light at the top: an ink mark there (white over photos elsewhere). */
const MARK_ON_LIGHT: ReadonlySet<PosterTemplate> = new Set<PosterTemplate>(["red-band"]);

/**
 * A story as a 9:16 poster: the story's photo + its headline + a small author line, laid out by one of
 * the templates (POSTER_TEMPLATES). It fills its parent's WIDTH (height follows at 9:16) and is a CSS size
 * container: every size inside is in cqw, so the same design reads identically as a ~110px thumbnail and as a full
 * phone screen. Presentational (no links or buttons) — callers wrap it and handle taps; a video story's clip autoplays.
 */
export function StoryPoster({ template, story, priority = false, className, titleId, mark = false }: StoryPosterProps) {
  const value = isPosterTemplate(template) ? template : DEFAULT_POSTER_TEMPLATE;
  const Design = DESIGNS[value];
  return (
    <div
      data-poster={value}
      className={cn("@container relative isolate aspect-[9/16] w-full overflow-hidden bg-surface-2", className)}
    >
      <Design story={story} priority={priority} titleId={titleId} />
      {mark && (
        <SpeedBarsSvg
          className={cn(
            "pointer-events-none absolute z-10 h-[2.4cqw] w-auto",
            MARK_PLACE[value] ?? "left-[5cqw] top-[4cqw]",
            MARK_ON_LIGHT.has(value) ? "text-ink/40" : "text-white/70 drop-shadow-[0_0.2cqw_0.6cqw_rgb(0_0_0/0.35)]",
          )}
        />
      )}
    </div>
  );
}
