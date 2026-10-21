"use client";

import { Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { REEL_SECONDS, setAutoScroll } from "./reel-autoscroll";

/*
 * Phones in the reels (owner 2026-10-15): after the reader has swiped past 2 stories, a small "Auto-scroll" card slides
 * in from the right edge, mid-screen. Tapping it turns auto-scroll on. Ignored (✕, or swiping on past it), it comes back
 * after 10 more stories, then once more after 15 more — then never again on this visit.
 */

/** Stories seen before each reminder: 2, then +10, then +15. */
const SHOW_AT = [2, 12, 27];

export function AutoScrollNudge({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const step = useRef(0);
  const shownAtIndex = useRef<number | null>(null);

  useEffect(() => {
    // Off (auto-scroll on, or not a phone): the card isn't rendered; nothing to watch.
    if (!enabled) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const reels = [...document.querySelectorAll<HTMLElement>("[data-reel-feed] li[data-feed-item]")];
      const middle = window.innerHeight / 2;
      const index = reels.findIndex((reel) => {
        const box = reel.getBoundingClientRect();
        return box.top <= middle && box.bottom >= middle;
      });
      if (index < 0) return;
      // Showing, and the reader swiped on past it: that's an "ignore".
      if (shownAtIndex.current !== null) {
        if (index > shownAtIndex.current) {
          shownAtIndex.current = null;
          setVisible(false);
        }
        return;
      }
      const due = SHOW_AT[step.current];
      if (due !== undefined && index >= due) {
        step.current += 1;
        shownAtIndex.current = index;
        setVisible(true);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  const hide = () => {
    shownAtIndex.current = null;
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {enabled && visible && (
        <motion.div
          // Not a dialog (owner 2026-10-15: "I can't scroll"): the reels stop swiping while a dialog is open.
          role="complementary"
          aria-label="Auto-scroll"
          initial={{ x: "120%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "120%", opacity: 0, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="fixed right-0 top-1/2 z-60 -translate-y-1/2"
        >
          {/* A small red tab on the screen's edge (owner 2026-10-15: "small and attractive"). */}
          <div className="relative flex items-center rounded-l-full bg-linear-to-r from-[#ff3b3b] to-brand py-1 pl-1 pr-1 text-white shadow-[0_8px_24px_-8px_rgb(227_6_19/0.6)] ring-1 ring-white/30">
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                hide();
              }}
              aria-label={`Turn on auto-scroll: next story every ${REEL_SECONDS} seconds`}
              className="flex items-center gap-1.5 rounded-full pr-1.5 active:scale-95"
            >
              <span className="relative flex size-7 items-center justify-center rounded-full bg-white text-brand">
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/60" />
                <Play aria-hidden className="relative ml-0.5 size-3.5 fill-current" />
              </span>
              <span className="text-xs font-extrabold tracking-wide">Auto</span>
            </button>
            <button
              type="button"
              onClick={hide}
              aria-label="Not now"
              className="inline-flex size-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
            >
              <X aria-hidden className="size-3" strokeWidth={3} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
