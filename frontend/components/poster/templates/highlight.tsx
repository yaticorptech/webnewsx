import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * From the bottom (cqw): 7 padding · 7 author line · 4.5 gap · title · 4 gap · 1.3 bar. The bars need open leading
 * (1.5, set on the words' span so the Indic leading can't tighten it): no clamp needs more than 59 (4 × 8.4, 5 × 7.2,
 * 6 × 6.4, 7 × 5.6, × 1.5) → the text starts by ~83 from the bottom.
 */
const TITLE_SIZES = [
  "text-[8.4cqw] line-clamp-4",
  "text-[7.2cqw] line-clamp-5",
  "text-[6.4cqw] line-clamp-6",
  "text-[5.6cqw] line-clamp-7",
] as const;

/**
 * Highlight (owner 2026-10-07, for tall 9:16 photos): the whole poster is the photo; at the bottom a short red bar, the
 * headline in ink with each line on its own white highlighter bar, and the author line over a dark fade.
 */
export function HighlightPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-ink/80 via-ink/35 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start px-[6cqw] pb-[7cqw]">
        <span aria-hidden className="slant h-[1.3cqw] w-[16cqw] bg-brand [--slant-x:1cqw]" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="mt-[4cqw] font-wide font-extrabold tracking-[-0.012em] text-ink"
          mark="bg-white px-[2cqw] py-[0.5cqw] leading-[1.5] box-decoration-clone shadow-[0_0.5cqw_2cqw_-0.5cqw_rgb(0_0_0/0.35)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw]" />
      </div>
    </div>
  );
}
