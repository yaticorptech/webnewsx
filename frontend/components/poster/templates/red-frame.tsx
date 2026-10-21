import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * Inside the frame, the text grows up from 9.5 above the bottom: author line 7 · 4.5 gap · title. Even at the Indic
 * leading no clamp needs more than 66 (5 × 9, 6 × 7.6, 7 × 6.6, 8 × 5.8, × 1.32) → under ~88, inside the fade (~98).
 */
const TITLE_SIZES = [
  "text-[9cqw] line-clamp-5",
  "text-[7.6cqw] line-clamp-6",
  "text-[6.6cqw] line-clamp-7",
  "text-[5.8cqw] line-clamp-8",
] as const;

/**
 * Red frame (owner 2026-10-02, for tall 9:16 photos): the whole poster is the photo, with a thin brand-red frame set a
 * little in from the edge; the logo sits on a white tab that breaks the frame's top edge; a big white headline and the
 * author line inside the frame at the bottom, over a dark fade.
 */
export function RedFramePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[55%] bg-linear-to-t from-ink/85 via-ink/40 to-ink/0" />
      </PosterImage>

      <span aria-hidden className="absolute inset-[3.5cqw] rounded-[2cqw] border-[1cqw] border-brand" />

      <div className="absolute inset-x-[9cqw] bottom-[9.5cqw] flex flex-col">
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
