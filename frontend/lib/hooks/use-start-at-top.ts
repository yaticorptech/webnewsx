"use client";

import { useLayoutEffect } from "react";

/** The URL a Back/Forward just went to: `popstate` fires before the router renders that page. */
let traversedTo: string | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    traversedTo = window.location.href;
  });
}

/**
 * Opens the page at its top when it's reached by a link. The reel feed leaves the window several screens down, and
 * the router doesn't always reset that, so a shorter page would open scrolled to its end (the footer). Back/Forward
 * keeps the browser's restored position, and the first load (before `<html data-hydrated>`) is left to the browser.
 */
export function useStartAtTop(): void {
  useLayoutEffect(() => {
    const traversal = traversedTo === window.location.href;
    traversedTo = null;
    if (traversal || !("hydrated" in document.documentElement.dataset)) return;
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
}
