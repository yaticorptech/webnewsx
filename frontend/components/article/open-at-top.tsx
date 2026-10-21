"use client";

import { useLayoutEffect } from "react";

/** When the last back / forward happened: those restore their own scroll position. */
let poppedAt = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => (poppedAt = Date.now()));

/**
 * A story opened from a card always starts at its top, on the image (owner 2026-10-16: the first open sometimes landed
 * halfway down the text). Not on back / forward (the browser puts you back where you were) or a #link (comments).
 */
export function OpenAtTop() {
  useLayoutEffect(() => {
    if (window.location.hash || Date.now() - poppedAt < 1500) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    // Once more after the first paint: late layout (fonts, the pending skeleton leaving) must not leave it partway.
    const frame = requestAnimationFrame(() => {
      if (window.scrollY > 0 && window.scrollY < window.innerHeight * 3) window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
