"use client";

import { useEffect, useState } from "react";

type Options = {
  /** Never hide above this scroll offset (px). */
  offset?: number;
  /** Minimum scroll delta before toggling, to ignore jitter (px). */
  tolerance?: number;
  /** Only active while this media query matches (e.g. mobile). */
  media?: string;
  /** false = never hide (e.g. reel feeds, whose reels are sized to the space under the bar). Default true. */
  enabled?: boolean;
  /**
   * Checked on every (rAF-throttled) scroll update: while it returns true the bar stays visible. Pass a stable
   * (module-level) function — a new one per render would re-subscribe every time.
   */
  pinned?: () => boolean;
  /**
   * Checked the same way: while it returns true the bar stays hidden past `offset` — scrolling up doesn't bring it
   * back, only reaching the top does. Also a stable function.
   */
  stayHidden?: () => boolean;
};

/** True while the user scrolls down (past `offset`), false when scrolling up. rAF-throttled. */
export function useHideOnScroll({ offset = 72, tolerance = 8, media, enabled = true, pinned, stayHidden }: Options = {}): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mql = media ? window.matchMedia(media) : null;
    let lastY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      if ((mql && !mql.matches) || pinned?.()) {
        setHidden(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (y <= offset) setHidden(false);
      else if (delta > tolerance || stayHidden?.()) setHidden(true);
      else if (delta < -tolerance) setHidden(false);
      if (Math.abs(delta) > tolerance || y <= offset) lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onMediaChange = () => update();

    window.addEventListener("scroll", onScroll, { passive: true });
    mql?.addEventListener("change", onMediaChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      mql?.removeEventListener("change", onMediaChange);
      if (frame) cancelAnimationFrame(frame);
      // Turned off (or options changed): show the bar again rather than leaving it hidden.
      setHidden(false);
    };
  }, [offset, tolerance, media, enabled, pinned, stayHidden]);

  return enabled && hidden;
}
