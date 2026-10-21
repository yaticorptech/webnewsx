import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The card (cqw): 5.5 padding · 1.3 bar · 3.5 gap · title · 4 gap · 7 author line · 5.5 padding, 6 above the edge.
 * Even at the Indic leading no clamp needs more than 44 (4 × 7.8, 5 × 6.6, 5 × 5.9, 6 × 5.2, × 1.32) → under ~78.
 */
const TITLE_SIZES = [
  "text-[7.8cqw] line-clamp-4",
  "text-[6.6cqw] line-clamp-5",
  "text-[5.9cqw] line-clamp-5",
  "text-[5.2cqw] line-clamp-6",
] as const;

/**
 * Floating card (owner 2026-10-02, for tall 9:16 photos): the whole poster is the photo, the logo on a white pill
 * top-left, and near the bottom a rounded white card (a touch see-through) with a red bar, the headline in ink and
 * the author line.
 */
export function CardPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[40%] bg-linear-to-t from-ink/45 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-[5cqw] bottom-[6cqw] flex flex-col rounded-[5cqw] bg-white/92 px-[5.5cqw] pb-[5.5cqw] pt-[5.5cqw] text-ink shadow-[0_2.5cqw_8cqw_-2cqw_rgb(0_0_0/0.55)]">
        <span aria-hidden className="h-[1.3cqw] w-[14cqw] rounded-full bg-brand" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="mt-[3.5cqw] font-wide font-extrabold leading-[1.1] tracking-[-0.012em]"
        />
        <PosterByline author={story.author} tone="dark" priority={priority} className="mt-[4cqw]" />
      </div>
    </div>
  );
}
