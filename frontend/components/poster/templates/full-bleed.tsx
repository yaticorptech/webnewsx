import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The text block grows up from the bottom: 7 padding + 7 author line + 4.5 gap + the title. Each clamp holds the longest
 * headline of its step (≤ 45 / 80 / 115 / 150 characters), and even at the Indic leading no clamp needs more than 74
 * (5 × 10, 7 × 8, 8 × 7, 9 × 6.2, × 1.32) → the block stays under ~93 (52% of the height), inside the dark fade (72%).
 */
const TITLE_SIZES = [
  "text-[10cqw] line-clamp-5",
  "text-[8cqw] line-clamp-7",
  "text-[7cqw] line-clamp-8",
  "text-[6.2cqw] line-clamp-9",
] as const;

/**
 * Full bleed: the photo fills the whole poster; the logo sits top-left on a white pill; a dark fade rises from the
 * bottom and carries a large white headline with the small author line under it.
 */
export function FullBleedPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[30cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[72%] bg-linear-to-t from-ink from-8% via-ink/70 via-45% to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[6cqw] pb-[7cqw]">
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-wide font-black leading-[1.04] tracking-[-0.018em] text-white [text-shadow:0_0.3cqw_2cqw_rgb(0_0_0/0.35)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw]" />
      </div>
    </div>
  );
}
