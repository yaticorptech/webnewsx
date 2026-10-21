import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * From the top (cqw): the photo (flexes) · 5 gap · 1.6 bar · 4 gap · title · 4 gap · 7 author line · 5 padding. Even at
 * the Indic leading no clamp needs more than 59 (4 × 11, 5 × 9, 5 × 7.6, 6 × 6.6, × 1.32), which leaves the photo
 * ~76 tall.
 */
const TITLE_SIZES = [
  "text-[11cqw] line-clamp-4",
  "text-[9cqw] line-clamp-5",
  "text-[7.6cqw] line-clamp-5",
  "text-[6.6cqw] line-clamp-6",
] as const;

/** The photo's bottom edge rises toward the right — the logo's forward lean. */
const PHOTO_CLIP = "[clip-path:polygon(0_0,100%_0,100%_calc(100%-9cqw),0_100%)]";

/**
 * Big headline (owner 2026-10-02): type first — on white, the photo on top with a slanted bottom edge, then a short red
 * bar and the headline set huge in black at the bottom (owner 2026-10-05: every design's headline at the bottom), and
 * the author line at the bottom left.
 */
export function BoldTypePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 flex flex-col bg-white text-ink">
      <PosterImage
        src={story.imageUrl}
        video={story.videoUrl}
        frame={story.imageFrame}
        blur={story.imageBlur}
        priority={priority}
        className={`min-h-0 flex-1 ${PHOTO_CLIP}`}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-[22cqw] bg-linear-to-b from-ink/35 to-ink/0" />
      </PosterImage>
      <div className="flex shrink-0 flex-col px-[7cqw] pt-[5cqw]">
        <span aria-hidden className="slant h-[1.6cqw] w-[20cqw] bg-brand [--slant-x:1.2cqw]" />
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="mt-[4cqw] font-wide font-black leading-[1.02] tracking-[-0.025em]"
        />
      </div>
      {/* The author at the bottom left, like every design (owner 2026-10-05). */}
      <PosterByline author={story.author} tone="dark" priority={priority} className="shrink-0 px-[7cqw] pb-[5cqw] pt-[4cqw]" />
    </div>
  );
}
