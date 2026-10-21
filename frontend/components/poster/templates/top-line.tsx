import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * From the bottom (cqw): 6 padding · 7 author line · 4.5 gap · title · 4 gap · 1.3 bar. Even at the Indic leading no
 * clamp needs more than 50 (4 × 9, 5 × 7.6, 6 × 6.4, 7 × 5.6, × 1.32) → the text starts by ~73 from the bottom, inside
 * the dark fade (~115).
 */
const TITLE_SIZES = [
  "text-[9cqw] line-clamp-4",
  "text-[7.6cqw] line-clamp-5",
  "text-[6.4cqw] line-clamp-6",
  "text-[5.6cqw] line-clamp-7",
] as const;

/**
 * Red line (owner 2026-10-02 as "Top headline", for tall 9:16 photos; owner 2026-10-05: every design's headline at the
 * bottom): the whole poster is the photo; a short red bar and a big white headline rise from a dark fade at the bottom,
 * above the author line.
 */
export function TopLinePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[24cqw] bg-linear-to-b from-ink/40 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[65%] bg-linear-to-t from-ink/90 via-ink/50 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start px-[6cqw] pb-[6cqw]">
        <span aria-hidden className="slant h-[1.3cqw] w-[16cqw] bg-brand [--slant-x:1cqw]" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="mt-[4cqw] font-wide font-black leading-[1.04] tracking-[-0.018em] text-white [text-shadow:0_0.3cqw_2cqw_rgb(0_0_0/0.35)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw]" />
      </div>
    </div>
  );
}
