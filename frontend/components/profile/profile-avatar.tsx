"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "@/components/ui/modal";
import { cn, initialsOf } from "@/lib/utils";

export type ProfileAvatarProps = {
  src: string | null;
  name: string;
  className?: string;
  /** "card": a rounded square in a white frame, like the Press Pass photo (owner 2026-10-31); default the ringed circle. */
  shape?: "circle" | "card";
  /** Bigger portrait (the phone profile card, owner 2026-10-31). */
  large?: boolean;
};

/** Where the photo sits in the ring, relative to the enlarged photo centred on screen. */
type Origin = { x: number; y: number; scale: number };

/** The enlarged photo's side (px): most of the screen, at most the stored 512 px avatar. */
function viewerSize(): number {
  return Math.min(window.innerWidth * 0.88, window.innerHeight * 0.8, 512);
}

function originOf(photo: HTMLElement | null): Origin {
  const rect = photo?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0, scale: 0.2 };
  return {
    x: rect.left + rect.width / 2 - window.innerWidth / 2,
    y: rect.top + rect.height / 2 - window.innerHeight / 2,
    scale: rect.width / viewerSize(),
  };
}

const PHOTO: Variants = {
  inRing: (origin: Origin) => origin,
  enlarged: { x: 0, y: 0, scale: 1 },
};
const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Profile portrait: a round photo in a thin logo-red ring with a white gap (owner 2026-09-26: circle only, no
 * frame or block behind it). Initials fallback when the image is missing or broken.
 * Owner 2026-09-29: tapping the photo lifts it out of the ring into a large circle over a dimmed page; a tap
 * anywhere (or Esc) puts it back.
 */
export function ProfileAvatar({ src, name, className, shape = "circle", large = false }: ProfileAvatarProps) {
  const card = shape === "card";
  const round = card ? "rounded-2xl" : "rounded-full";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const photoRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  /** Open, or still flying back into the ring (the ring stays empty until it lands). */
  const [lifted, setLifted] = useState(false);
  const [origin, setOrigin] = useState<Origin>({ x: 0, y: 0, scale: 0.2 });

  const show = () => {
    setOrigin(originOf(photoRef.current));
    setOpen(true);
    setLifted(true);
  };
  const hide = () => {
    // Fly back to where the ring is now (the window may have been resized meanwhile).
    setOrigin(originOf(photoRef.current));
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOrigin(originOf(photoRef.current));
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={cn(
        "relative shrink-0 self-start",
        card ? "rounded-[1.15rem] bg-surface p-1 shadow-[0_10px_24px_-10px_rgb(120_10_20/0.45)] ring-1 ring-black/5" : "ring-draw rounded-full p-0.75 sm:p-1",
        className,
      )}
    >
      <div className={cn(round, "bg-surface", card ? "p-0" : "p-0.75 sm:p-1")}>
        <div className={cn("relative flex items-center justify-center overflow-hidden bg-tint", large ? "size-[clamp(7.5rem,36vw,10rem)]" : "size-24 sm:size-33", round)}>
          <span
            aria-hidden
            className={cn(
              "font-wider text-[2rem] font-black uppercase leading-none tracking-[-0.03em] text-brand sm:text-5xl",
              lifted && "invisible",
            )}
          >
            {initialsOf(name)}
          </span>
          {showImage && src && (
            <button
              ref={photoRef}
              type="button"
              onClick={show}
              aria-label={`View ${name}’s profile photo`}
              aria-haspopup="dialog"
              className={cn("absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand", round)}
            >
              <img
                src={src}
                alt={`${name}’s profile photo`}
                width={264}
                height={264}
                decoding="async"
                fetchPriority="high"
                referrerPolicy="no-referrer"
                draggable={false}
                // An error that fired before hydration never reaches onError: detect it on attach.
                ref={(img) => {
                  if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
                }}
                onError={() => setFailedSrc(src)}
                className={cn("block size-full bg-tint object-cover text-transparent", lifted && "invisible")}
              />
            </button>
          )}
        </div>
      </div>

      {src &&
        lifted &&
        createPortal(
          <AnimatePresence
            custom={origin}
            onExitComplete={() => {
              setLifted(false);
              photoRef.current?.focus({ preventScroll: true });
            }}
          >
            {open && (
              <motion.div
                key="viewer"
                role="dialog"
                aria-modal="true"
                aria-label={`${name}’s profile photo`}
                className="fixed inset-0 z-100 flex items-center justify-center"
              >
                <motion.div
                  aria-hidden
                  className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
                {/* The whole screen is the close button: a tap on the photo or anywhere around it. */}
                <button
                  type="button"
                  autoFocus
                  onClick={hide}
                  aria-label="Close photo"
                  className="absolute inset-0 focus-visible:outline-none"
                />
                <motion.img
                  src={src}
                  alt=""
                  referrerPolicy="no-referrer"
                  draggable={false}
                  custom={origin}
                  variants={PHOTO}
                  initial="inRing"
                  animate="enlarged"
                  exit="inRing"
                  transition={{ duration: 0.38, ease: EASE }}
                  className="pointer-events-none relative aspect-square w-[min(88vw,80dvh,32rem)] rounded-full bg-tint object-cover shadow-pop"
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
