import type { HTMLAttributes } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Shape preset; size it with Tailwind classes (h-*, w-*, aspect-*). */
  shape?: "block" | "text" | "circle" | "pill";
};

const SHAPES = {
  block: "rounded-lg",
  text: "h-[0.8em] rounded-sm",
  circle: "rounded-full",
  pill: "rounded-full",
} as const;

/** Shimmering placeholder block (`.skeleton`). Decorative — wrap groups in an aria-busy region. */
export function Skeleton({ shape = "block", className, ...props }: SkeletonProps) {
  return <div aria-hidden className={cn("skeleton", SHAPES[shape], className)} {...props} />;
}

/** A few lines of text placeholder; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} shape="text" className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * Placeholder in the exact footprint of a feed StoryCard (meta · 16:9 cover with the diagonal
 * slice · headline · excerpt · byline), with the speed-lines mark ghosted on the cover.
 */
export function StoryCardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-4 py-6", className)}>
      <div className="flex items-center gap-2">
        <Skeleton shape="pill" className="h-2.5 w-14" />
        <Skeleton shape="pill" className="ml-auto h-5 w-24" />
      </div>
      <div className="skeleton relative aspect-video w-full overflow-hidden rounded-xl">
        <SpeedBarsSvg className="absolute left-1/2 top-1/2 w-16 -translate-x-1/2 -translate-y-1/2 text-ink opacity-[0.06]" />
      </div>
      <div className="flex flex-col gap-2.5 pt-1">
        <Skeleton className="h-6 w-[92%] rounded-md" />
        <Skeleton className="h-6 w-[64%] rounded-md" />
      </div>
      <SkeletonText lines={3} />
      <div className="rule-speed text-border-strong">
        <SpeedBarsSvg className="h-2 w-auto" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" className="size-9 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Skeleton shape="pill" className="h-3 w-28 max-w-full" />
          <Skeleton shape="pill" className="h-2.5 w-16" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
          <Skeleton shape="pill" className="h-4 w-10" />
          <Skeleton shape="pill" className="h-4 w-10" />
          <Skeleton shape="pill" className="h-4 w-8" />
        </div>
      </div>
    </div>
  );
}
