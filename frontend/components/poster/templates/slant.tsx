import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The red block grows up from the bottom: 17 top (the slanted edge) + title + 4.5 gap + 7 author line + 6.5 padding.
 * Each clamp holds the longest headline of its step (≤ 45 / 80 / 115 / 150 characters), and even at the Indic leading
 * no clamp needs more than 58 (5 × 8.7, 6 × 7.3, 7 × 6.2, 8 × 5.5, × 1.32) → the block stays under ~93 (52% of the
 * poster).
 */
const TITLE_SIZES = [
  "text-[8.7cqw] line-clamp-5",
  "text-[7.3cqw] line-clamp-6",
  "text-[6.2cqw] line-clamp-7",
  "text-[5.5cqw] line-clamp-8",
] as const;

/*
 * The block's top edge rises 11cqw across the poster — the forward lean of the logo's bars. The white speed line
 * runs parallel to it 3.5cqw higher (same slope: -11/100), and its right end leans forward like the icon's bars.
 */
const BLOCK_CLIP = "[clip-path:polygon(0_12cqw,100%_1cqw,100%_100%,0_100%)]";
const LINE_CLIP = "[clip-path:polygon(0_6.7cqw,48cqw_1.42cqw,46.2cqw_3.42cqw,0_8.5cqw)]";

/**
 * Slant: the photo fills the poster; a large brand-red block with a forward-leaning top edge (the logo's tilt) crosses
 * the lower part and carries the white headline and the author line, with a white speed line above it; the logo sits
 * top-right on a white tag whose left edge leans the same way.
 */
export function SlantPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[28cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[55%] bg-linear-to-t from-ink/30 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[6cqw] pb-[6.5cqw] pt-[17cqw]">
        <span aria-hidden className={`absolute inset-0 bg-brand ${BLOCK_CLIP}`} />
        <span aria-hidden className={`absolute left-0 top-0 h-[8.5cqw] w-[48cqw] bg-white ${LINE_CLIP}`} />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="relative font-wide font-extrabold leading-[1.06] tracking-[-0.015em] text-white"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="relative mt-[4.5cqw]" />
      </div>
    </div>
  );
}
