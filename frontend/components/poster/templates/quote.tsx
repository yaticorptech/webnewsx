import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * From the bottom (cqw): 7 padding · 7 author line · 4 gap · 1.2 rule · 4 gap · title · quote mark ~14. Even at the
 * Indic leading no clamp needs more than 59 (4 × 9.2, 5 × 7.8, 6 × 6.6, 7 × 5.9, × 1.32) → under ~96, inside the fade.
 */
const TITLE_SIZES = [
  "text-[9.2cqw] line-clamp-4",
  "text-[7.8cqw] line-clamp-5",
  "text-[6.6cqw] line-clamp-6",
  "text-[5.9cqw] line-clamp-7",
] as const;

/**
 * Quote (owner 2026-10-02, for tall 9:16 photos): the whole poster is the photo, the logo on a white pill top-right;
 * at the bottom, over a deep fade, a big brand-red opening quote mark, the headline in an italic serif like a pull
 * quote, a short red rule and "— author". The serif's optical size is pinned (as on Newspaper).
 */
export function QuotePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink [font-variation-settings:'opsz'_32]">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[26cqw] bg-linear-to-b from-ink/35 to-ink/0" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-linear-to-t from-ink from-10% via-ink/65 via-50% to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[7cqw] pb-[7cqw]">
        <span aria-hidden className="-mb-[3cqw] h-[16cqw] font-serif text-[26cqw] font-black leading-none text-brand">
          &ldquo;
        </span>
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-serif font-semibold italic leading-[1.12] tracking-[-0.005em] text-white"
        />
        <span aria-hidden className="mt-[4cqw] h-[1.2cqw] w-[12cqw] bg-brand" />
        <PosterByline author={story.author} tone="light" prefix="—" priority={priority} className="mt-[4cqw]" />
      </div>
    </div>
  );
}
