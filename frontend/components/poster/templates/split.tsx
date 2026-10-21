import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * The ink panel is as tall as its text — 7 padding · 1.8 bar · 4.5 gap · title · 4 gap · 7 author line · 6.5 padding —
 * and the photo takes the rest (at least 45%), so a short headline never leaves an empty gap (owner 2026-10-05). Even at
 * the Indic leading every clamp stays under ~60 (5 × 9.4, 5 × 8, 6 × 6.8, 7 × 5.8, × 1.32).
 */
const TITLE_SIZES = [
  "text-[9.4cqw] line-clamp-5",
  "text-[8cqw] line-clamp-5",
  "text-[6.8cqw] line-clamp-6",
  "text-[5.8cqw] line-clamp-7",
] as const;

/**
 * Split: the photo on top under a subtle dark scrim; below it solid ink with a short red accent bar (the logo's slant), a
 * big white headline and the small light author line under it. The icon's speed bars sit faintly in the ink as a
 * watermark.
 */
export function SplitPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 flex flex-col bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="min-h-[45%] flex-1">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[30cqw] bg-linear-to-b from-ink/55 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[12cqw] bg-linear-to-t from-ink/45 to-ink/0" />
      </PosterImage>

      <div className="relative flex shrink-0 flex-col overflow-hidden px-[7cqw] pb-[6.5cqw] pt-[7cqw]">
        <SpeedBarsSvg className="absolute -right-[6cqw] bottom-[4cqw] h-auto w-[46cqw] text-white opacity-[0.045]" />
        <span aria-hidden className="slant relative h-[1.8cqw] w-[16cqw] shrink-0 bg-brand [--slant-x:1.3cqw]" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="relative mt-[4.5cqw] font-wide font-extrabold leading-[1.06] tracking-[-0.015em] text-white"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="relative mt-[4cqw]" />
      </div>
    </div>
  );
}
