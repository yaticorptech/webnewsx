import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * From the bottom (cqw): author line 14 (owner 2026-10-05: bottom left in every design) · red bar 5
 * padding × 2 + title. Even at the Indic
 * leading no clamp needs more than 44 (4 × 7.8, 5 × 6.6, 5 × 5.9, 6 × 5.2, × 1.32) → under ~73 (41%).
 */
const TITLE_SIZES = [
  "text-[7.8cqw] line-clamp-4",
  "text-[6.6cqw] line-clamp-5",
  "text-[5.9cqw] line-clamp-5",
  "text-[5.2cqw] line-clamp-6",
] as const;

/**
 * Ticker (owner 2026-10-02, for tall 9:16 photos): the whole poster is the photo; at the bottom the headline in white on
 * a full-width red bar, with the author line on a dark strip under it. (Owner 2026-10-07: no "NOW · WebNEWS • Latest"
 * crawl strip.)
 */
export function TickerPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[50%] bg-linear-to-t from-ink/70 via-ink/30 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col">
        <div className="bg-brand px-[6cqw] py-[5cqw]">
          <PosterTitle
            id={titleId}
            title={story.title}
            sizes={TITLE_SIZES}
            className="font-wide font-extrabold leading-[1.08] tracking-[-0.012em] text-white"
          />
        </div>
        {/* The author at the bottom left, like every design (owner 2026-10-05). */}
        <PosterByline author={story.author} tone="light" priority={priority} className="bg-ink px-[6cqw] py-[3.5cqw]" />
      </div>
    </div>
  );
}
