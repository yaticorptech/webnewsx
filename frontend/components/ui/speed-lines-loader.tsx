import type { CSSProperties } from "react";
import { SPEED_BARS, SPEED_VIEWBOX } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

export type SpeedLinesLoaderProps = {
  /** Width: xs 14 · sm 18 · md 26 · lg 40 · xl 64 px. */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Accessible label; the loader is announced as a status. Pass null when purely decorative. */
  label?: string | null;
  /** Colour comes from `currentColor`; defaults to brand red. */
  className?: string;
};

const WIDTHS: Record<NonNullable<SpeedLinesLoaderProps["size"]>, number> = { xs: 14, sm: 18, md: 26, lg: 40, xl: 64 };

/** The brand loader: the icon's three bars sweeping through in sequence (see `.speed-loader`). */
export function SpeedLinesLoader({ size = "md", label = "Loading", className }: SpeedLinesLoaderProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex text-brand", className)}
    >
      <svg
        viewBox={SPEED_VIEWBOX}
        aria-hidden
        focusable="false"
        className="speed-loader"
        style={{ "--sl-w": `${WIDTHS[size]}px` } as CSSProperties}
      >
        {SPEED_BARS.map((points) => (
          <polygon key={points} points={points} fill="currentColor" />
        ))}
      </svg>
    </span>
  );
}
