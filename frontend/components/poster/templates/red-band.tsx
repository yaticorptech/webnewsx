import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * Column (cqw): logo 18.4 · photo (the rest) · 6 gap · band 12 + title · author line 16. The photo flexes, so a long
 * title only makes it shorter: worst case (Indic, step 1) 5 × 7.2 × 1.32 ≈ 48 still leaves the photo ~77 tall.
 */
const TITLE_SIZES = [
  "text-[8.4cqw] line-clamp-4",
  "text-[7.2cqw] line-clamp-5",
  "text-[6.2cqw] line-clamp-5",
  "text-[5.6cqw] line-clamp-6",
] as const;

/**
 * Red band: a white poster with the logo centred at the top, the photo in the middle with rounded corners and generous
 * margins, a solid brand-red band across the bottom carrying the white headline, and the author line under it in ink.
 */
export function RedBandPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div aria-hidden className="h-[7cqw] shrink-0" />

      <PosterImage
        src={story.imageUrl}
        video={story.videoUrl}
        frame={story.imageFrame}
        blur={story.imageBlur}
        priority={priority}
        className="mx-[6cqw] min-h-0 flex-1 rounded-[4.5cqw] shadow-[0_1.5cqw_5cqw_-2cqw_rgb(22_24_29/0.35)]"
      />

      <div className="mt-[6cqw] shrink-0 bg-brand px-[7cqw] py-[6cqw]">
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-wide font-extrabold leading-[1.08] tracking-[-0.012em] text-white"
        />
      </div>

      <PosterByline author={story.author} tone="dark" priority={priority} className="shrink-0 px-[7cqw] pb-[5.5cqw] pt-[4cqw]" />
    </div>
  );
}
