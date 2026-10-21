import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * Like Full bleed: 7 padding + 7 author line + 4.5 gap + the title. Even at the Indic leading no clamp needs more than
 * 74 (5 × 10, 7 × 8, 8 × 7, 9 × 6.2, × 1.32) → the block stays under ~93 (52% of the height), inside the red fade (72%).
 */
const TITLE_SIZES = [
  "text-[10cqw] line-clamp-5",
  "text-[8cqw] line-clamp-7",
  "text-[7cqw] line-clamp-8",
  "text-[6.2cqw] line-clamp-9",
] as const;

/**
 * Red fade (owner 2026-10-07, for tall 9:16 photos): the whole poster is the photo, fading into WebNEWS red at the
 * bottom (not black), with a big white headline and the author line on the red.
 */
export function RedFadePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-brand">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[30cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[72%] bg-linear-to-t from-brand from-12% via-brand/75 via-45% to-brand/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[6cqw] pb-[7cqw]">
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-wide font-black leading-[1.04] tracking-[-0.018em] text-white [text-shadow:0_0.3cqw_2cqw_rgb(0_0_0/0.25)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw]" />
      </div>
    </div>
  );
}
