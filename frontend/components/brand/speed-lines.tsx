import { cn } from "@/lib/utils";

/**
 * Speed lines — the old app icon's three forward-leaning bars (polygons below, still used by the animated loader and
 * bursts). The static brand mark (SpeedBarsSvg / SpeedLines) is the WebNewsX "X" since 2026-11-02.
 */

/** Icon bar polygons in icon coordinates. */
export const SPEED_BARS = [
  "20,9 60,9 48,20 8,20",
  "20,26 60,26 48,37 8,37",
  "20,43 60,43 48,54 8,54",
] as const;

/**
 * A simple two-stroke "X" (owner 2026-11-02) in the same 64×64 space, for places that need plain polygons (the 3D
 * globe, data-URL placeholders): black stroke top-left → bottom-right, red stroke bottom-left → top-right.
 */
export const X_MARK = ["7,8 19,8 57,56 45,56", "6,57 16,57 58,9 49,7"] as const;

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

/**
 * The brand mark (owner 2026-11-02: the WebNewsX logo's "X" replaces the three bars everywhere): the X's shape in the
 * current text colour (white on a red button, red on a page), drawn by masking with /brand/x.svg. Square; size it by
 * height or width like before. The name stays for the many places that use it.
 */
export function SpeedBarsSvg({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      // Without a size given (an icon slot in a button), 1em square like an icon.
      className={cn("inline-block aspect-square shrink-0 bg-current", className ?? "size-[1.15em]")}
      style={{
        maskImage: "url(/brand/x.svg)",
        WebkitMaskImage: "url(/brand/x.svg)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function SpeedLines({ variant = "glyph", tone = "brand", className }: SpeedLinesProps) {
  if (variant === "rule") {
    return (
      <span aria-hidden className={cn("rule-speed w-full", TONE[tone], className)}>
        <SpeedBarsSvg className="h-[0.95em] w-auto" />
      </span>
    );
  }
  if (variant === "bars") {
    return <SpeedBarsSvg className={cn("block h-auto w-full", TONE[tone], className)} />;
  }
  return <SpeedBarsSvg className={cn("inline-block h-[0.95em] w-auto align-[-0.14em]", TONE[tone], className)} />;
}
