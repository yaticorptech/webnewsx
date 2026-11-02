import { SpeedBarsSvg } from "@/components/brand/speed-lines";
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

/** The brand loader (owner 2026-11-02: the WebNewsX "X" instead of the three bars): the X breathing, in the text colour. */
export function SpeedLinesLoader({ size = "md", label = "Loading", className }: SpeedLinesLoaderProps) {
  const w = WIDTHS[size];
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex text-brand", className)}
      style={{ width: w, height: w }}
    >
      <SpeedBarsSvg className="size-full animate-x-breathe" />
    </span>
  );
}
