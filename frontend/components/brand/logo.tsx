import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Intrinsic ratio of the owner's logo (2026-10-30, logo-light.png: wordmark + "PULSE OF PEOPLE"). */
export const LOGO_ASPECT = 2124 / 427;

export type LogoProps = {
  /** Rendered height in px (width follows the aspect ratio). Override responsively with className (e.g. "h-5 sm:h-6"). */
  height?: number;
  /** High fetch priority for above-the-fold logos (masthead). */
  priority?: boolean;
  className?: string;
  alt?: string;
};

/** The WebNEWS wordmark (`logo-light.png`, the only logo used — SPEC §2.1). */
export function Logo({ height = 24, priority = false, className, alt = "WebNEWS" }: LogoProps) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <span
      className={cn("inline-flex h-(--logo-h) shrink-0 [&>img]:h-full [&>img]:w-auto", className)}
      style={{ "--logo-h": `${height}px` } as CSSProperties}
    >
      <img
        src="/brand/logo-light.png"
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
        className="block dark:hidden"
      />
      {/* Dark mode: "Web" in white (logo-dark.png), News stays red. */}
      <img
        src="/brand/logo-dark.png"
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        loading="lazy"
        draggable={false}
        className="hidden dark:block"
      />
    </span>
  );
}
