import { cn } from "@/lib/utils";

/**
 * Profile grid (SPEC §3.7): 3 posters across on phones (Instagram), 4 on tablets, 5 in a row from laptops up (owner
 * 2026-10-08: "5 story per row", the rest on the next row; before: 6) — the posters widen with the screen. Server-safe
 * (used by loading.tsx).
 */
export const GRID_CLASS = "grid grid-cols-3 gap-1.5 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5";

/** A placeholder in the poster's footprint. */
export function TileSkeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton aspect-9/16 rounded-xl sm:rounded-2xl", className)} />;
}
