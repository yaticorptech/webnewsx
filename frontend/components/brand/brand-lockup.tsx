import { PulseDot } from "@/components/ui/pulse-dot";
import { TAGLINE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { LOGO_ASPECT } from "./logo";

export type LockupSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

export type BrandLockupProps = {
  /**
   * Wordmark height: 2xs 14 · xs 24 · sm 32 · md 48 · lg 72 · xl 104 px. The tagline is tuned per
   * size so it always fits under the wordmark. Responsive: add `lockup-*` classes with variants
   * via className, e.g. `size="2xs" className="md:lockup-xs lg:lockup-md"`.
   */
  size?: LockupSize;
  align?: "center" | "start";
  /** Animate the tagline's heartbeat dot (default true; always static under reduced motion). */
  pulse?: boolean;
  priority?: boolean;
  /**
   * Scale the whole lockup down when its box is squeezed (the phone top bar): the wordmark shrinks with the width and
   * the tagline shrinks with it, so it never runs past the wordmark under the icons next to it.
   */
  fit?: boolean;
  className?: string;
};

const HEIGHTS: Record<LockupSize, number> = { "2xs": 14, xs: 24, sm: 32, md: 48, lg: 72, xl: 104 };
const SIZE_CLASS: Record<LockupSize, string> = {
  "2xs": "lockup-2xs",
  xs: "lockup-xs",
  sm: "lockup-sm",
  md: "lockup-md",
  lg: "lockup-lg",
  xl: "lockup-xl",
};

/**
 * The lockup from the owner's reference: wordmark with the live-text tagline "• PULSE OF THE PUBLIC"
 * ALWAYS directly under it (owner rule, SPEC §2.1) — black weight, extra-wide, uppercase, letter-spaced, centred,
 * with the webnews.in red shine sweeping across the letters.
 * The dot beats like a heart. Sizing is pure CSS (`lockup-*` utilities), so it can change per breakpoint.
 */
export function BrandLockup({ size = "md", align = "center", pulse = true, priority, fit = false, className }: BrandLockupProps) {
  const height = HEIGHTS[size];
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 flex-col",
        align === "center" ? "items-center" : "items-start",
        SIZE_CLASS[size],
        fit && "w-[calc(var(--lockup-h)*8.598)] [container-type:inline-size]",
        className,
      )}
    >
      <img
        src="/brand/logo-light.svg"
        alt="WebNEWS"
        width={Math.round(height * LOGO_ASPECT)}
        height={height}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
        className={fit ? "block h-auto w-full" : "block h-(--lockup-h) w-auto max-w-full"}
      />
      <TaglineText
        pulse={pulse}
        // fit: never wider than the wordmark (5.6% of its width ≈ the tagline's own width at 0.07em tracking).
        className={cn(
          "mt-(--tag-gap) [--tagline-track:var(--tag-track)]",
          fit ? "text-[length:min(var(--tag-size),5.6cqi)]" : "text-(length:--tag-size)",
        )}
      />
    </span>
  );
}

/**
 * The tagline on its own (footers, compact spots). Size it with a text-* class; tracking via
 * `--tagline-track` (default 0.32em). Trailing tracking is cancelled so it centres optically.
 */
export function TaglineText({
  className,
  pulse = true,
}: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-[0.8em] font-black uppercase leading-none text-ink font-wider", className)}>
      {/* The dot beats, then the shine sweeps the words — one rhythm (owner 2026-10-02; globals.css .tagline-dot). */}
      <PulseDot size="em" pulse={pulse} tone="bright" className="tagline-dot" />
      <span className="tagline-shine -mr-(--tagline-track,0.32em) whitespace-nowrap tracking-(--tagline-track,0.32em)">{TAGLINE}</span>
    </span>
  );
}
