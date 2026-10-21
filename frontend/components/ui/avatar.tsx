"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { cn, initialsOf } from "@/lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number;

export type AvatarProps = {
  src?: string | null;
  /** Display name — used for alt text and the initials fallback. */
  name: string;
  /** xs 24 · sm 32 · md 40 · lg 56 · xl 88 · 2xl 128, or a pixel number. */
  size?: AvatarSize;
  /** Ring with a white gap: `true`/"brand" = logo red (publisher highlights); "ink" = black (the viewer's avatar in the masthead). */
  ring?: boolean | "brand" | "ink";
  /** Decorative next to a visible name → empty alt. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
};

const PX: Record<Exclude<AvatarSize, number>, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88, "2xl": 128 };

/** Round profile image with an initials fallback (missing or broken image). */
export function Avatar({ src, name, size = "md", ring = false, decorative = false, priority, className }: AvatarProps) {
  const px = typeof size === "number" ? size : PX[size];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  // Errors that fire before hydration never reach onError: detect an already-broken image on mount.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0 && src) setFailedSrc(src);
    },
    [src],
  );

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-tint-2 align-middle",
        ring && "ring-2 ring-offset-2 ring-offset-bg",
        ring && (ring === "ink" ? "ring-ink" : "ring-brand"),
        className,
      )}
      style={{ width: px, height: px } as CSSProperties}
    >
      <span
        aria-hidden
        className="font-wide font-extrabold uppercase leading-none text-brand-strong"
        style={{ fontSize: Math.max(10, Math.round(px * 0.38)) }}
      >
        {initialsOf(name)}
      </span>
      {showImage && src ? (
        <img
          ref={imgRef}
          src={src}
          alt={decorative ? "" : name}
          width={px}
          height={px}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailedSrc(src)}
          // text-transparent: a broken image must never show its alt text over the initials.
          className="absolute inset-0 size-full bg-tint-2 object-cover text-transparent"
        />
      ) : (
        !decorative && <span className="sr-only">{name}</span>
      )}
    </span>
  );
}
