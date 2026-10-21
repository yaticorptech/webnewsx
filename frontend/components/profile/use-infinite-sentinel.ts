"use client";

import { useEffect, useRef } from "react";

export type InfiniteSentinelOptions = {
  /** Observe only while more pages exist and none is loading. */
  enabled: boolean;
  onReach: () => void;
  /** Start loading before the sentinel is on screen. */
  rootMargin?: string;
};

/**
 * Infinite-scroll trigger: attach the returned ref to an element after the list. The observer is
 * recreated whenever `enabled` flips back on, so a sentinel that is still visible after a short
 * page loads fires again (no "stuck" lists). Works inside scroll containers (modals) too, because
 * intersections with the viewport are clipped by overflow ancestors.
 */
export function useInfiniteSentinel<T extends Element = HTMLDivElement>({
  enabled,
  onReach,
  rootMargin = "640px 0px",
}: InfiniteSentinelOptions) {
  const ref = useRef<T>(null);
  const latest = useRef(onReach);

  useEffect(() => {
    latest.current = onReach;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return ref;
}
