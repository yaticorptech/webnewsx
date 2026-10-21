"use client";

import { useEffect } from "react";
import { SCROLL_TO_TOP_EVENT } from "@/lib/scroll-to-top";

/*
 * Page-level scroll plumbing for reels (components/feed/reel-card.tsx). The page itself (the window) keeps scrolling —
 * the feed's infinite-scroll sentinel, live-arrival anchoring, the "new stories" pill, back-to-top and the browser's
 * back/forward scroll restoration all rely on it — and CSS scroll snapping on <html> makes it move one reel at a time
 * (globals.css, "Reel feed"): mandatory on feed pages (`data-reel-feed`), proximity under a story (`data-reel-proximity`).
 */

/** Marks the "More from @publisher" reels under a story: proximity snapping, so reading the story is never interrupted. */
export const REEL_ZONE_ATTR = "data-reel-proximity";

let restoreSnap: (() => void) | null = null;

/**
 * Turns snapping off until the page reaches the top (or the reader takes over, or 1.5 s pass). `scrollToTop` drives its
 * smooth scroll frame by frame with instant jumps, and the browser would snap every one of them back to the nearest reel.
 */
export function suspendSnapUntilTop(): void {
  restoreSnap?.();
  const root = document.documentElement;
  root.style.scrollSnapType = "none";
  const restore = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("wheel", restore);
    window.removeEventListener("touchstart", restore);
    window.removeEventListener("keydown", restore);
    window.clearTimeout(failsafe);
    root.style.removeProperty("scroll-snap-type");
    if (restoreSnap === restore) restoreSnap = null;
  };
  const onScroll = () => {
    if (window.scrollY <= 1) restore();
  };
  const failsafe = window.setTimeout(restore, 1500);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("wheel", restore, { passive: true });
  window.addEventListener("touchstart", restore, { passive: true });
  window.addEventListener("keydown", restore);
  restoreSnap = restore;
}

/** While mounted, every "back to top" (button, pill, "You're all caught up") runs with snapping suspended. */
export function useSnapFreeScrollToTop(): void {
  useEffect(() => {
    window.addEventListener(SCROLL_TO_TOP_EVENT, suspendSnapUntilTop);
    return () => {
      window.removeEventListener(SCROLL_TO_TOP_EVENT, suspendSnapUntilTop);
      restoreSnap?.();
    };
  }, []);
}

/**
 * True once the reels under a story reach the upper half of the screen. The phone masthead then stays put (instead of
 * hiding on scroll-down) because reels are sized to the space under it. Cheap enough for a rAF-throttled scroll handler.
 */
export function reelZoneReached(): boolean {
  const zone = document.querySelector(`[${REEL_ZONE_ATTR}]`);
  return zone !== null && zone.getBoundingClientRect().top < window.innerHeight / 2;
}

/** Are the reels under a story (their section) on screen at all? */
export function reelZoneOnScreen(): boolean {
  const rect = document.querySelector(`[${REEL_ZONE_ATTR}]`)?.getBoundingClientRect();
  return rect !== undefined && rect.top < window.innerHeight && rect.bottom > 0;
}

/** Is the first story of the feed (where live arrivals land) on screen? Reels start below the sticky masthead. */
export function firstReelOnScreen(): boolean {
  const first = document.querySelector<HTMLElement>("[data-feed-item]");
  return first !== null && first.getBoundingClientRect().top >= 0;
}

/** A swipe this far (share of a reel) or this fast (px/ms) moves to the next reel; less, and it settles back. */
const PAGE_DISTANCE = 0.18;
const PAGE_SPEED = 0.35;
/** The glide to the reel, ms (eased out, like Instagram's). */
const GLIDE_MS = 320;
/** Swiping from the first reel under a story back up into it: the fling's reach (speed × this) and its glide. */
const FLING_MS = 420;
const FLING_GLIDE_MS = 650;

/**
 * Phones (owner 2026-10-05: "one article per swipe, never several, never stopping in between — and smooth, like
 * Instagram Reels"): on a reel feed the page doesn't scroll by itself under the finger (`touch-action: none` on
 * [data-reel-feed], globals.css). The reel follows the finger 1:1, and on release glides — eased out, in one motion —
 * to the next or previous reel, or back to this one after a short, slow nudge. No browser fling to fight, so it never
 * skips reels or stops between two. Taps, sideways swipes (section swipe) and the pull-to-refresh at the very top
 * are left alone. CSS snapping is paused while a swipe runs and restored when it lands.
 *
 * `scope: "story"` — the "More from @publisher" reels under a story (owner 2026-10-05: the same swipe there): only a
 * swipe that starts on one of those reels pages; above the first one the story scrolls as usual (a swipe back up into
 * it just stops where the finger leaves it).
 */
export function useOneReelPerSwipe(scope: "feed" | "story" = "feed"): void {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    const story = scope === "story";
    /** Where a swipe has to start (and the CSS turns panning off). */
    const area = story ? `[${REEL_ZONE_ATTR}] .reel` : "[data-reel-feed]";
    /** Every place a swipe can land, in page order: the reels (in the feed, then loading / the end of the feed). */
    const stops = () =>
      [...document.querySelectorAll<HTMLElement>(story ? `[${REEL_ZONE_ATTR}] .reel` : "[data-reel-feed] .reel, [data-reel-feed] .reel-snap")];
    const topOf = (el: HTMLElement) =>
      window.scrollY + el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    const scrollTo = (top: number) => window.scrollTo({ top, behavior: "instant" });

    let frame = 0;
    const stopGlide = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const glideTo = (target: number, ms = GLIDE_MS) => {
      stopGlide();
      const from = window.scrollY;
      const distance = target - from;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (Math.abs(distance) < 1 || reduce) {
        scrollTo(target);
        root.style.removeProperty("scroll-snap-type");
        return;
      }
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        scrollTo(from + distance * eased);
        if (t < 1) frame = requestAnimationFrame(step);
        else {
          frame = 0;
          root.style.removeProperty("scroll-snap-type");
        }
      };
      frame = requestAnimationFrame(step);
    };

    type Drag = { x: number; y: number; scroll: number; index: number; list: HTMLElement[]; axis: "y" | "x" | null; last: { y: number; t: number }; speed: number };
    let drag: Drag | null = null;

    const onStart = (event: TouchEvent) => {
      drag = null;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) return;
      // Phone widths only: that's where the CSS turns the browser's own panning off (tablets keep native snapping).
      if (!window.matchMedia("(max-width: 639.98px)").matches) return;
      if (!(event.target instanceof Element) || !event.target.closest(area)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      stopGlide();
      const list = stops();
      if (list.length === 0) return;
      // The stop nearest to where reels sit (the one on screen).
      let index = 0;
      let best = Infinity;
      list.forEach((el, i) => {
        const away = Math.abs(topOf(el) - window.scrollY);
        if (away < best) {
          best = away;
          index = i;
        }
      });
      drag = { x: touch.clientX, y: touch.clientY, scroll: window.scrollY, index, list, axis: null, last: { y: touch.clientY, t: event.timeStamp }, speed: 0 };
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!drag || !touch) return;
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (drag.axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Sideways: the section swipe's. Pulling down at the very top: pull-to-refresh's.
        if (Math.abs(dx) > Math.abs(dy) || (!story && dy > 0 && window.scrollY <= 1)) {
          drag = null;
          return;
        }
        drag.axis = "y";
        root.style.scrollSnapType = "none";
      }
      const elapsed = event.timeStamp - drag.last.t;
      if (elapsed > 0) drag.speed = (drag.last.y - touch.clientY) / elapsed;
      drag.last = { y: touch.clientY, t: event.timeStamp };
      scrollTo(drag.scroll - dy);
    };

    const onEnd = () => {
      const current = drag;
      drag = null;
      if (!current || current.axis !== "y") return;
      const here = current.list[current.index];
      if (!here) return;
      const moved = window.scrollY - current.scroll;
      const reelHeight = here.getBoundingClientRect().height || window.innerHeight;
      let target = current.index;
      if (Math.abs(moved) > reelHeight * PAGE_DISTANCE || Math.abs(current.speed) > PAGE_SPEED) {
        target += (Math.abs(current.speed) > PAGE_SPEED ? current.speed : moved) > 0 ? 1 : -1;
      }
      if (target < 0) {
        // Above the first reel: the feed's page top; under a story, back into the story (comments) — carried on by the
        // swipe's own speed, like a normal fling, instead of stopping dead where the finger left it.
        if (story) {
          const fling = Math.min(0, current.speed) * FLING_MS;
          if (fling < -40) glideTo(Math.max(0, window.scrollY + fling), FLING_GLIDE_MS);
          else root.style.removeProperty("scroll-snap-type");
        } else glideTo(0);
      } else glideTo(topOf(current.list[Math.min(target, current.list.length - 1)]!));
    };

    // Under a story (no CSS snapping on phones): a normal fling from the comments that stops partway into a reel
    // settles onto the nearest one when it's close — like proximity snapping, but never while the finger is down.
    let fingers = 0;
    let settleTimer = 0;
    const countDown = (event: TouchEvent) => {
      fingers = event.touches.length;
      window.clearTimeout(settleTimer);
      if (story && fingers === 0) settleTimer = window.setTimeout(settle, 140);
    };
    const settle = () => {
      if (fingers > 0 || frame || drag) return;
      const list = stops();
      let best: number | null = null;
      for (const el of list) {
        const top = topOf(el);
        if (best === null || Math.abs(top - window.scrollY) < Math.abs(best - window.scrollY)) best = top;
      }
      if (best !== null && Math.abs(best - window.scrollY) > 1 && Math.abs(best - window.scrollY) < window.innerHeight * 0.2) glideTo(best);
    };
    const onScroll = () => {
      if (!story || frame || fingers > 0) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 140);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    window.addEventListener("touchstart", countDown, { passive: true });
    window.addEventListener("touchend", countDown, { passive: true });
    window.addEventListener("touchcancel", countDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stopGlide();
      window.clearTimeout(settleTimer);
      window.removeEventListener("touchstart", countDown);
      window.removeEventListener("touchend", countDown);
      window.removeEventListener("touchcancel", countDown);
      window.removeEventListener("scroll", onScroll);
      root.style.removeProperty("scroll-snap-type");
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [scope]);
}
