import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The panel (cqw): 1.2 red edge · 5.5 padding · title · 4 gap · 7 author line · 5.5 padding, 6 above the edge. Even
 * at the Indic leading no clamp needs more than 44 (4 × 7.8, 5 × 6.6, 5 × 5.9, 6 × 5.2, × 1.32) → under ~80.
 */
const TITLE_SIZES = [
  "text-[7.8cqw] line-clamp-4",
  "text-[6.6cqw] line-clamp-5",
  "text-[5.9cqw] line-clamp-5",
  "text-[5.2cqw] line-clamp-6",
] as const;

/**
 * Glass (owner 2026-10-07, for tall 9:16 photos): the whole poster is the photo; near the bottom a rounded frosted
 * panel with a thin red top edge carries the white headline and the author line. The panel is tinted dark as well as
 * blurred, so the headline still reads where the blur isn't drawn (the shared JPEG, poster-jpeg.tsx).
 */
export function GlassPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-ink/50 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-[5cqw] bottom-[6cqw] flex flex-col overflow-hidden rounded-[5cqw] border border-white/25 bg-ink/45 px-[5.5cqw] pb-[5.5cqw] pt-[6.7cqw] text-white shadow-[0_2.5cqw_8cqw_-2cqw_rgb(0_0_0/0.55)] backdrop-blur-[4cqw] backdrop-saturate-150">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[1.2cqw] bg-brand" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-wide font-extrabold leading-[1.1] tracking-[-0.012em]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4cqw]" />
      </div>
    </div>
  );
}
