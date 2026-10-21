import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Intrinsic ratio of the wordmark SVG (viewBox 1276.8 × 148.5). */
export const LOGO_ASPECT = 1276.8 / 148.5;

export type LogoProps = {
  /** Rendered height in px (width follows the aspect ratio). Override responsively with className (e.g. "h-5 sm:h-6"). */
  height?: number;
  /** High fetch priority for above-the-fold logos (masthead). */
  priority?: boolean;
  className?: string;
  alt?: string;
};

/** The WebNEWS wordmark (`logo-light.svg`, the only logo used — SPEC §2.1). */
export function Logo({ height = 24, priority = false, className, alt = "WebNEWS" }: LogoProps) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <span
      className={cn("inline-flex h-(--logo-h) shrink-0 [&>img]:h-full [&>img]:w-auto", className)}
      style={{ "--logo-h": `${height}px` } as CSSProperties}
    >
      <img
        src="/brand/logo-light.svg"
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
        className="block dark:hidden"
      />
      {/* Dark mode: "Web" in white (logo-dark.svg), NEWS stays red. */}
      <img
        src="/brand/logo-dark.svg"
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
