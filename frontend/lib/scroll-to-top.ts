/**
 * Fired right before any "back to top" scroll, so live UI doesn't fight it: the feed stops re-anchoring
 * arriving stories (which would pull the page back down halfway through the trip).
 */
export const SCROLL_TO_TOP_EVENT = "webnews:scroll-to-top";

let cancelCurrent: (() => void) | null = null;

/**
 * Scrolls the page to the very top and always lands on 0.
 *
 * The smooth version is driven frame by frame instead of `scrollTo({ behavior: "smooth" })`: any other
 * programmatic scroll cancels a native smooth scroll, and live stories arriving on the way do exactly that
 * (motion's height-"auto" measurement restores the scroll position it read — itself a smooth scroll back
 * down because of the page's CSS `scroll-behavior: smooth` — and browser scroll anchoring shifts it), which
 * used to leave the reader stuck mid-page. Each frame here sets an absolute position, so
 * a nudge from anything else is corrected on the next frame. The reader can take over with wheel, touch or
 * keys at any time.
 */
export function scrollToTop(behavior: ScrollBehavior): void {
  window.dispatchEvent(new Event(SCROLL_TO_TOP_EVENT));
  cancelCurrent?.();

  const start = window.scrollY;
  if (behavior !== "smooth" || start <= 0) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  const root = document.documentElement;
  root.style.overflowAnchor = "none";
  const duration = Math.min(700, Math.max(320, 240 + start / 6));
  const t0 = performance.now();
  let frame = 0;
  let restoreTimer = 0;

  const stopListening = () => {
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("keydown", cancel);
  };
  const restoreAnchoring = () => {
    window.clearTimeout(restoreTimer);
    root.style.removeProperty("overflow-anchor");
  };
  function cancel() {
    cancelAnimationFrame(frame);
    stopListening();
    restoreAnchoring();
    cancelCurrent = null;
  }
  const step = (now: number) => {
    const progress = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    // "instant": the page has CSS `scroll-behavior: smooth`, which would turn every frame into a new
    // smooth scroll that restarts before it moves.
    window.scrollTo({ top: Math.round(start * (1 - eased)), behavior: "instant" });
    if (progress < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    stopListening();
    cancelCurrent = null;
    // Stories may still be sliding in above; keep anchoring off until they have settled.
    restoreTimer = window.setTimeout(restoreAnchoring, 1200);
  };

  cancelCurrent = cancel;
  window.addEventListener("wheel", cancel, { passive: true, once: true });
  window.addEventListener("touchstart", cancel, { passive: true, once: true });
  window.addEventListener("keydown", cancel, { once: true });
  frame = requestAnimationFrame(step);
}
