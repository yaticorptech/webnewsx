import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/*
 * Bottom (cqw): title · 4.5 gap · 7 author line · 7 padding. Even at the Indic leading no clamp
 * needs more than 58 (4 × 10, 5 × 8.4, 6 × 7, 7 × 6.2, × 1.32) → the text stays under ~77 (43%), inside the fade.
 */
const TITLE_SIZES = [
  "text-[10cqw] line-clamp-4",
  "text-[8.4cqw] line-clamp-5",
  "text-[7cqw] line-clamp-6",
  "text-[6.2cqw] line-clamp-7",
] as const;

/**
 * Magazine (owner 2026-10-02): a cover — the WebNEWS logo large as the masthead on a white band with a red rule, the
 * photo filling the rest, and at the bottom a big serif headline and the author line (owner 2026-10-07: no "Cover story"
 * chip — every reporter would pick it).
 * The serif's optical size is pinned so a thumbnail wraps like the full poster (as on Newspaper).
 */
export function MagazinePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 flex flex-col bg-ink [font-variation-settings:'opsz'_32]">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="min-h-0 flex-1">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[70%] bg-linear-to-t from-ink from-5% via-ink/65 via-45% to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start px-[6cqw] pb-[7cqw]">
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-serif font-bold leading-[1.06] tracking-[-0.01em] text-white [text-shadow:0_0.3cqw_2cqw_rgb(0_0_0/0.4)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw] max-w-full" />
      </div>
    </div>
  );
}
