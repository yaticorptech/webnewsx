import { PosterByline, PosterImage, type PosterDesignProps } from "../poster-parts";

/**
 * No template (owner 2026-10-07): the cover as the reporter uploaded it, with no design of its own over it. Owner
 * 2026-10-14: no headline on the picture either — only the author line (name + Follow) at the bottom, on a short dark
 * fade so it reads on any photo. The headline stays for screen readers (the poster is labelled by it).
 */
export function PlainPoster({ story, priority, titleId }: PosterDesignProps) {
  return (
    <div className="absolute inset-0 bg-ink">
      <PosterImage src={story.imageUrl} video={story.videoUrl} frame={story.imageFrame} blur={story.imageBlur} priority={priority} className="absolute inset-0">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[28%] bg-linear-to-t from-ink/80 via-ink/35 via-50% to-ink/0" />
      </PosterImage>

      <div className="absolute inset-x-0 bottom-0 flex flex-col px-[6cqw] pb-[7cqw]">
        <span id={titleId} className="sr-only">
          {story.title}
        </span>
        <PosterByline author={story.author} tone="light" priority={priority} />
      </div>
    </div>
  );
}
