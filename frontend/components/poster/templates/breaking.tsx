import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The bottom block (cqw): 1.2 red bar · 4 padding · title · 4 gap · 7 author line · 5 padding, 6 above the edge. Each
 * clamp holds the longest headline of its step, and even at the Indic leading no clamp needs more than 48 (4 × 8.4,
 * 5 × 7.2, 6 × 6.2, 7 × 5.2, × 1.32) → the block stays under ~76 (43% of the poster), inside the dark fade.
 */
const TITLE_SIZES = [
  "text-[8.4cqw] line-clamp-4",
  "text-[7.2cqw] line-clamp-5",
  "text-[6.2cqw] line-clamp-6",
  "text-[5.2cqw] line-clamp-7",
] as const;

/**
 * Dark box (owner 2026-10-02 as "Breaking"; owner 2026-10-07: no "● BREAKING" tag — every reporter would pick it): the
 * photo fills the poster; at the bottom the white headline in a dark box with a short red bar on its top edge, and the
 * author line.
 */
export function BreakingPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/40 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-linear-to-t from-ink/80 via-ink/40 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-[5cqw] bottom-[6cqw] flex flex-col">
        <span aria-hidden className="h-[1.2cqw] w-[24cqw] bg-brand" />
        <div className="flex flex-col bg-ink/88 px-[5cqw] pb-[5cqw] pt-[4cqw] shadow-[0_2cqw_6cqw_-2cqw_rgb(0_0_0/0.6)]">
          <PosterTitle
            id={titleId}
            title={story.title}
            sizes={TITLE_SIZES}
            className="font-wide font-extrabold leading-[1.08] tracking-[-0.012em] text-white"
          />
          <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4cqw]" />
        </div>
      </div>
    </div>
  );
}
