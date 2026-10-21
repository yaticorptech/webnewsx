"use client";

import { useEffect, useRef } from "react";

/** A swipe: at least this far sideways, clearly more sideways than up/down, and quick. */
const SWIPE_MIN_PX = 70;
const SWIPE_RATIO = 1.8;
const SWIPE_MAX_MS = 600;
/** Swipes that start this close to the screen's side edges are the phone's own back gesture. */
const SWIPE_EDGE_PX = 24;

/** Where a sideways swipe belongs to something else: a field, a dialog, a row that scrolls sideways, `ignore`. */
function swipeBlocked(target: Element, ignore: string): boolean {
  if (target.closest(`input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], ${ignore}`)) return true;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}

export type SwipeDirection = "left" | "right";

/**
 * Phones (<768px): a quick, clearly sideways swipe that nothing else claims calls `onSwipe` with the finger's
 * direction ("left" = the finger moved left, so the next thing comes in). The bottom bar moves between its sections
 * with it (bottom-tab-bar.tsx); a profile between its tabs (profile-view.tsx). `ignore`: a selector whose elements
 * (and their contents) the swipe leaves alone — `[data-no-swipe]` by default.
 */
export function useSwipe(enabled: boolean, onSwipe: (direction: SwipeDirection) => void, { ignore = "[data-no-swipe]" }: { ignore?: string } = {}): void {
  const handler = useRef(onSwipe);
  useEffect(() => {
    handler.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; at: number } | null = null;
    const onStart = (event: TouchEvent) => {
      start = null;
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || !window.matchMedia("(max-width: 767.98px)").matches) return;
      if (touch.clientX < SWIPE_EDGE_PX || touch.clientX > window.innerWidth - SWIPE_EDGE_PX) return;
      if (!(event.target instanceof Element) || swipeBlocked(event.target, ignore)) return;
      start = { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
    };
    const onEnd = (event: TouchEvent) => {
      const from = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (event.timeStamp - from.at > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]') || window.getSelection()?.toString()) return;
      handler.current(dx < 0 ? "left" : "right");
    };
    const onCancel = () => {
      start = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, ignore]);
}
