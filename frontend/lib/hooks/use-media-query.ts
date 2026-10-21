"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Returns `serverFallback` during SSR/hydration so markup
 * matches, then the live value. Prefer CSS breakpoints for layout; use this only for behaviour
 * (e.g. modal vs bottom sheet).
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

/** < 640px (Tailwind `sm`). */
export const useIsSmallScreen = () => useMediaQuery("(max-width: 639.98px)");
