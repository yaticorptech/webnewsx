import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The lower third (cqw): 1.2 red rule · white bar 7 padding + title · dark strip 11 (author line), 7 above the edge. Even
 * at the Indic leading no clamp needs more than 45 (4 × 8, 5 × 6.8, 5 × 6, 6 × 5.3, × 1.32) → under ~65 (37%).
 */
const TITLE_SIZES = [
  "text-[8cqw] line-clamp-4",
  "text-[6.8cqw] line-clamp-5",
  "text-[6cqw] line-clamp-5",
  "text-[5.3cqw] line-clamp-6",
] as const;

/**
 * Broadcast (owner 2026-10-02): a TV news frame — the photo fills the poster; at the bottom a lower third: a red rule,
 * the headline in ink on a white bar, and a dark strip with the author line, like a channel's ticker. (Owner
 * 2026-10-07: no "● LIVE" bug or "Top story" tab — every reporter would pick it.)
 */
export function BroadcastPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/40 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-ink/55 to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-[4cqw] bottom-[7cqw] flex flex-col items-start shadow-[0_2cqw_6cqw_-2cqw_rgb(0_0_0/0.55)]">
        <span aria-hidden className="h-[1.2cqw] w-full bg-brand" />
        <div className="w-full bg-white px-[4.5cqw] py-[3.5cqw]">
          <PosterTitle
            id={titleId}
            title={story.title}
            sizes={TITLE_SIZES}
            className="font-wide font-extrabold leading-[1.08] tracking-[-0.012em] text-ink"
          />
        </div>
        <div className="flex w-full items-center bg-ink px-[4.5cqw] py-[2cqw]">
          <PosterByline author={story.author} tone="light" priority={priority} className="min-w-0" />
        </div>
      </div>
    </div>
  );
}
