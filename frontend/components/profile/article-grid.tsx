"use client";

import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { cn } from "@/lib/utils";
import { GRID_CLASS, TileSkeleton } from "./grid-parts";
import { useInfiniteSentinel } from "./use-infinite-sentinel";

/** Items per backend page (GET /api/users/:u/articles default) — drives the stagger rhythm. */
const PAGE_SIZE = 12;
const STAGGER_MS = 45;

export type ProfileGridProps<T extends { id: string }> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** Ids that arrived via realtime (pop in instead of the page fade). */
  freshIds?: ReadonlySet<string>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Loading the next page failed. */
  isError: boolean;
  onLoadMore: () => void;
  /** Rendered when there is nothing at all. */
  empty: ReactNode;
  /** Accessible name of the list. */
  label: string;
  className?: string;
};

/**
 * Tile grid (3 columns ≥640px, 2 below) with infinite scroll: an IntersectionObserver sentinel
 * loads the next cursor page, skeleton tiles fill the row while it loads, and tiles fade up in a
 * stagger (CSS, so the server-rendered first page animates before hydration). Realtime inserts pop
 * in at the top and the rest of the grid glides into place.
 */
export function ProfileGrid<T extends { id: string }>({
  items,
  renderItem,
  freshIds,
  hasNextPage,
  isFetchingNextPage,
  isError,
  onLoadMore,
  empty,
  label,
  className,
}: ProfileGridProps<T>) {
  const sentinel = useInfiniteSentinel<HTMLDivElement>({
    enabled: hasNextPage && !isFetchingNextPage && !isError,
    onReach: onLoadMore,
  });

  if (items.length === 0 && !hasNextPage) return <>{empty}</>;

  return (
    <div className={className} aria-busy={isFetchingNextPage || undefined}>
      <ul aria-label={label} className={GRID_CLASS}>
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const fresh = freshIds?.has(item.id) ?? false;
            return (
              <motion.li
                key={item.id}
                layout="position"
                initial={fresh ? { opacity: 0, scale: 0.86 } : false}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
                className="min-w-0"
              >
                <div
                  className={cn("h-full", !fresh && "animate-fade-up")}
                  style={fresh ? undefined : { animationDelay: `${(index % PAGE_SIZE) * STAGGER_MS}ms` }}
                >
                  {renderItem(item, index)}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {isFetchingNextPage &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={`skeleton-${i}`} aria-hidden>
              <TileSkeleton />
            </li>
          ))}
      </ul>

      <div ref={sentinel} aria-hidden className="h-px w-full" />

      {isFetchingNextPage && (
        <div className="mt-6 flex justify-center">
          <SpeedLinesLoader size="sm" label="Loading more stories" />
        </div>
      )}

      {isError && (
        <div role="alert" className="mt-6 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted">Couldn’t load more stories.</p>
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={onLoadMore}>
            Try again
          </Button>
        </div>
      )}

      {!hasNextPage && items.length > 3 && <EndOfFile />}
    </div>
  );
}

/** Closing mark under a fully loaded grid. */
function EndOfFile() {
  return (
    <div className="mt-10 flex items-center gap-3 text-faint" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <SpeedBarsSvg className="h-2.5 w-auto text-brand" />
      <span className="kicker">End of file</span>
      <SpeedBarsSvg className="h-2.5 w-auto text-brand" />
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
