import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * Box (cqw, 100 × 177.8): the photo takes whatever the text panel leaves (at least 45%); the panel is as tall as its
 * text — 3 padding · title · 4 gap · 7 author line · 5 padding — so a short headline never leaves an empty gap (owner
 * 2026-10-05). Even at the Indic leading (1.32) no clamp below needs more than 56, so the photo keeps ≥ 58%.
 */
const TITLE_SIZES = [
  "text-[10.5cqw] line-clamp-4",
  "text-[9cqw] line-clamp-4",
  "text-[7.8cqw] line-clamp-5",
  "text-[6.8cqw] line-clamp-6",
] as const;

/**
 * Classic (the default, the owner's own layout): the photo, then the headline in big bold white on a rich red-to-ink
 * gradient (the photo melts into it), and the small author line under it at the bottom left.
 */
export function ClassicPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 flex flex-col bg-ink">
      <PosterImage
        src={story.imageUrl}
        video={story.videoUrl}
        frame={story.imageFrame}
        blur={story.imageBlur}
        priority={priority}
        className="min-h-[45%] flex-1"
      >
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[20cqw] bg-linear-to-b from-brand/0 to-brand" />
      </PosterImage>

      <div className="relative flex shrink-0 flex-col overflow-hidden bg-linear-to-b from-brand from-5% to-ink px-[6cqw] pb-[5cqw] pt-[3cqw]">
        {/* A soft sheen from the top-left corner gives the gradient some depth. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(110%_70%_at_0%_0%,rgb(255_255_255/0.14),transparent_65%)]"
        />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="relative font-wide font-extrabold leading-[1.08] tracking-[-0.012em] text-white"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="relative mt-[4cqw]" />
      </div>
    </div>
  );
}
