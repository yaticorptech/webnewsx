"use client";

import { Heart, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { SpeedLinesBurst } from "@/components/brand/speed-lines-motion";
import { showPendingPage } from "@/components/layout/pending-page";
import type { ArticleVideo } from "@/lib/shared/contracts";
import { openStoryHref, type storyHref } from "@/lib/story-link";
import { cn } from "@/lib/utils";
import { clipLength, mediaAspect, registerAutoplay, setUserPlaying, setVideoSound, useVideoSound } from "@/lib/video-playback";

export type StoryCoverProps = {
  src: string;
  blur: string | null;
  width: number | null;
  height: number | null;
  /** Article URL; a single click/tap opens it (after the double-tap window). */
  href?: string;
  /** `href` is a story's Read more link (another site): opens it instead of routing (lib/story-link.ts). */
  external?: boolean;
  /** A members-only story the viewer can't read: a tap opens the "buy premium" popup (lib/story-link.ts). */
  gate?: ReturnType<typeof storyHref>["gate"];
  /** Double-click / double-tap handler (like). Omit for an inert cover. */
  onDoubleActivate?: () => void;
  priority?: boolean;
  className?: string;
  /** A video story: the clip plays (muted, looped, one at a time) over the poster `src` (lib/video-playback.ts). */
  video?: ArticleVideo | null;
  /** A fixed frame (width ÷ height) the media fills, instead of the media's own shape (e.g. 16 / 9 for article media). */
  aspect?: number;
};

/** Second tap within this window = double tap (like). Reels use the same window to tell a tap from a double tap. */
export const DOUBLE_TAP_MS = 280;

/**
 * The cover in its own shape (9:16 … 16:9; a portrait one is centred and at most 80% of the screen tall) — a plain
 * rounded rectangle (owner 2026-09-26: no cut corner). The tiny blur data URL paints first, the image
 * fades in over it (priority covers skip the fade so they paint with the HTML), and hovering
 * zooms gently. Single click opens the story; a double click / double tap likes it instead
 * (the big heart pops in the middle). A video story shows its clip instead, in its own shape, with play/pause and
 * sound buttons and its length.
 */
export function StoryCover({
  src,
  blur,
  width,
  height,
  href,
  external = false,
  gate = null,
  onDoubleActivate,
  priority = false,
  className,
  video,
  aspect,
}: StoryCoverProps) {
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(priority);
  const lastTap = useRef(0);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heart, setHeart] = useState(0);

  useEffect(() => {
    // The image may finish before hydration (no onLoad then).
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  useEffect(
    () => () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    },
    [],
  );

  const interactive = Boolean(href || onDoubleActivate);
  const ratio = aspect ?? (video ? mediaAspect(video.width, video.height) : mediaAspect(width, height));

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (href && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1)) {
      window.open(href, "_blank", "noopener");
      return;
    }
    const now = event.timeStamp;
    if (onDoubleActivate && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (navTimer.current) clearTimeout(navTimer.current);
      navTimer.current = null;
      setHeart((n) => n + 1);
      onDoubleActivate();
      return;
    }
    lastTap.current = now;
    if (!href) return;
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(
      () => {
        navTimer.current = null;
        openStoryHref({ href, external, gate }, (path) => {
          showPendingPage(path);
          router.push(path);
        }, Boolean(onDoubleActivate));
      },
      onDoubleActivate ? DOUBLE_TAP_MS : 0,
    );
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => href && !external && router.prefetch(href)}
      data-video={video ? "" : undefined}
      className={cn(
        "group/cover relative isolate w-full touch-manipulation select-none overflow-hidden rounded-xl bg-surface-2",
        interactive && "cursor-pointer",
        className,
      )}
      style={
        {
          aspectRatio: String(ratio),
          // Portrait: centred, never taller than 80% of the screen (the width follows the height).
          ...(ratio < 1 ? { maxWidth: `calc(80dvh * ${ratio})`, marginInline: "auto" } : {}),
          backgroundImage: blur ? `url("${blur}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } as CSSProperties
      }
    >
      {video ? (
        <StoryVideo video={video} poster={src} priority={priority} />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt=""
          width={width ?? 1600}
          height={height ?? 900}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            "transition-[opacity,transform] duration-700 ease-out-expo will-change-transform",
            interactive && "group-hover/cover:scale-104 motion-reduce:group-hover/cover:scale-100",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* Depth: a faint ink vignette at the bottom edge of the photo (image overlay, not a surface). */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-ink/15 to-transparent" />
      <HeartPop beat={heart} onDone={() => setHeart(0)} />
    </div>
  );
}

/**
 * The big heart that pops in the middle of a cover (or a reel's poster, reel-card.tsx) on a double-tap like, with a
 * burst of speed lines. `beat` = how many double taps so far: each new one replays it; 0 renders nothing. `onDone`
 * runs a moment after it settles (reset `beat` to 0 there). Place it in a `relative` box.
 */
export function HeartPop({ beat, onDone }: { beat: number; onDone: () => void }) {
  return (
    <AnimatePresence>
      {beat > 0 && (
        <motion.span
          key={beat}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -ml-11 -mt-11 flex size-22 items-center justify-center text-white"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1.18, 1], opacity: [0, 1, 1] }}
          exit={{ scale: 1.25, opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          onAnimationComplete={() => setTimeout(onDone, 350)}
        >
          <Heart className="size-20 fill-brand text-brand drop-shadow-[0_6px_18px_rgb(22_24_29/0.35)]" strokeWidth={1.5} />
          <SpeedLinesBurst size={150} />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** The clip itself plus its controls. Buttons never bubble to the cover (no navigation / double-tap like). */
function StoryVideo({ video, poster, priority }: { video: ArticleVideo; poster: string; priority: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const sound = useVideoSound();

  useEffect(() => {
    const element = ref.current;
    return element ? registerAutoplay(element) : undefined;
  }, []);

  const togglePlay = (event: MouseEvent) => {
    event.stopPropagation();
    if (ref.current) setUserPlaying(ref.current, !playing);
  };
  const toggleSound = (event: MouseEvent) => {
    event.stopPropagation();
    setVideoSound(!sound);
  };

  return (
    <>
      <video
        ref={ref}
        src={video.url}
        poster={poster}
        muted
        loop
        playsInline
        preload={priority ? "auto" : "metadata"}
        aria-hidden
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5">
        <VideoButton label={playing ? "Pause video" : "Play video"} onClick={togglePlay}>
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </VideoButton>
        <VideoButton label={sound ? "Turn sound off" : "Turn sound on"} onClick={toggleSound}>
          {sound ? <Volume2 /> : <VolumeX />}
        </VideoButton>
      </div>
      <span className={cn(CLIP_LENGTH, "absolute bottom-3 right-3 z-10")}>{clipLength(video.durationMs)}</span>
    </>
  );
}

const CLIP_LENGTH = "pointer-events-none rounded-full bg-ink/70 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-white";

function VideoButton({ label, onClick, children }: { label: string; onClick: (event: MouseEvent) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      className="relative inline-flex size-9 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur-sm transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-brand focus-visible:bg-brand [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
