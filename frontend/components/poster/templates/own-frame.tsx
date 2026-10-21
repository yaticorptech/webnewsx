import { PosterByline, PosterImage, PosterTitle, type PosterDesignProps } from "../poster-parts";

/* The same text block as No template / Full bleed, so the headline and name sit where readers expect them. */
const TITLE_SIZES = [
  "text-[10cqw] line-clamp-5",
  "text-[8cqw] line-clamp-7",
  "text-[7cqw] line-clamp-8",
  "text-[6.2cqw] line-clamp-9",
] as const;

/**
 * Your frame (owner 2026-10-08): the cover photo, the reporter's own frame over it (a 9:16 image with a see-through
 * middle — their branding), then the headline and the author line on a light fade at the bottom. Without a frame (none
 * saved with the story) it reads like No template.
 */
export function OwnFramePoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0" />
      {story.overlayUrl && (
        <img
          src={story.overlayUrl}
          alt=""
          aria-hidden
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[52%] bg-linear-to-t from-ink/85 via-ink/45 to-ink/0" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[6cqw] pb-[7cqw]">
        <PosterTitle
          id={titleId}
          title={story.title}
          sizes={TITLE_SIZES}
          className="font-wide font-black leading-[1.04] tracking-[-0.018em] text-white [text-shadow:0_0.3cqw_2cqw_rgb(0_0_0/0.45)]"
        />
        <PosterByline author={story.author} tone="light" priority={priority} className="mt-[4.5cqw]" />
      </div>
    </div>
  );
}
