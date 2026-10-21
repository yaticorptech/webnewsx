import { cn } from "@/lib/utils";

/**
 * Speed lines — the owner's app icon (docs/brand/icon.svg): three identical forward-leaning bars,
 * polygons `20,9 60,9 48,20 8,20` stacked at y = 9 / 26 / 43 in a 64×64 box. This file is the
 * single source of that geometry for the UI (glyphs, rules, loader, bursts).
 */

/** Icon bar polygons in icon coordinates. */
export const SPEED_BARS = [
  "20,9 60,9 48,20 8,20",
  "20,26 60,26 48,37 8,37",
  "20,43 60,43 48,54 8,54",
] as const;

/** Tight box around the three bars (x 8–60, y 9–54). */
export const SPEED_VIEWBOX = "8 9 52 45";
export const SPEED_ASPECT = 52 / 45;

export type SpeedLinesProps = {
  /**
   * - `glyph`: inline mark sized by font-size (height ≈ 0.72em) — section kickers, separators.
   * - `rule`: glyph followed by a hairline that fills the row (card dividers).
   * - `bars`: fills its box (set a width or height), for large decorative use; keeps the icon ratio.
   */
  variant?: "glyph" | "rule" | "bars";
  tone?: "brand" | "ink" | "muted" | "current";
  className?: string;
};

const TONE = {
  brand: "text-brand",
  ink: "text-ink",
  muted: "text-muted",
  current: "",
} as const;

/** The three bars as an SVG. Colour = currentColor. */
export function SpeedBarsSvg({ className }: { className?: string }) {
  return (
    <svg viewBox={SPEED_VIEWBOX} aria-hidden focusable="false" className={cn("shrink-0", className)}>
      {SPEED_BARS.map((points) => (
        <polygon key={points} points={points} fill="currentColor" />
      ))}
    </svg>
  );
}

export function SpeedLines({ variant = "glyph", tone = "brand", className }: SpeedLinesProps) {
  if (variant === "rule") {
    return (
      <span aria-hidden className={cn("rule-speed w-full", TONE[tone], className)}>
        <SpeedBarsSvg className="h-[0.72em] w-auto" />
      </span>
    );
  }
  if (variant === "bars") {
    return <SpeedBarsSvg className={cn("block h-auto w-full", TONE[tone], className)} />;
  }
  return <SpeedBarsSvg className={cn("inline-block h-[0.72em] w-auto align-[-0.06em]", TONE[tone], className)} />;
}
