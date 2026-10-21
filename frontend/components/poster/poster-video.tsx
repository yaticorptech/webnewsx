"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { registerAutoplay } from "@/lib/video-playback";

/**
 * A video story's clip in the poster's photo box (owner 2026-09-26: "it should start playing"): muted and looped while
 * the poster is on screen, one clip at a time across the page (lib/video-playback.ts — the feed's sound switch applies).
 * The poster frame shows until the first frame is decoded. Decorative, like the photo it replaces.
 */
export function PosterVideo({
  src,
  poster,
  priority = false,
  style,
}: {
  src: string;
  poster: string;
  priority?: boolean;
  /** The reporter's placement of the clip in its box (poster-parts.tsx `frameStyle`). */
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    return element ? registerAutoplay(element) : undefined;
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster || undefined}
      muted
      loop
      playsInline
      disablePictureInPicture
      preload={priority ? "auto" : "metadata"}
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 size-full object-cover"
      style={style}
    />
  );
}
