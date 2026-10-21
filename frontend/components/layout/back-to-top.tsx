"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { reelZoneOnScreen } from "@/components/feed/reel-scroll";
import { useReelFeed } from "@/components/providers/feed-layout-provider";
import { scrollToTop } from "@/lib/scroll-to-top";
import { cn } from "@/lib/utils";

/** Shown once the reader is this many viewport heights down the page. */
const SHOW_AFTER_SCREENS = 1.5;
/** Form pages with their own bottom actions (composer, settings, Press Pass application) don't get the button. */
const HIDDEN_ON = ["/publish", "/settings", "/press-pass"];

/**
 * Back-to-top (SPEC §3.3-FINAL): a round white button with the brand-red arrow, fixed bottom-right —
 * above the phone bottom tab bar (safe-area aware) and away from the top-centred "new stories" pill.
 * Fades/slides in after ~1.5 screens of scrolling; smooth-scrolls home (instant under reduced
 * motion) and hands focus to <main> so keyboard users continue from the top. Below 768px (tab bar) it stays away from
 * reels, whose action rail runs down the right edge there: never on the feeds, and not while a story's "More from"
 * reels are on screen.
 */
export function BackToTop() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [overReels, setOverReels] = useState(false);
  const excluded = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  // Reel feeds (Home, Following, categories in the reel layout).
  const reelFeed = useReelFeed();

  useEffect(() => {
    if (excluded) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
      setOverReels(reelZoneOnScreen());
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [excluded, pathname]);

  const toTop = () => {
    scrollToTop(reduceMotion ? "instant" : "smooth");
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <AnimatePresence>
      {visible && !excluded && (
        <motion.button
          key="back-to-top"
          type="button"
          data-back-to-top=""
          aria-label="Back to top"
          title="Back to top"
          onClick={toTop}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.92, transition: { duration: 0.16 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={cn(
            "group fixed right-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)] z-40 flex size-12 items-center justify-center rounded-full border border-border bg-surface text-brand shadow-pop transition-colors duration-200 hover:border-tint-border hover:bg-tint active:bg-tint-3 md:right-6 md:bottom-6",
            (reelFeed || overReels) && "max-md:hidden",
          )}
        >
          <ArrowUp
            aria-hidden
            strokeWidth={2.5}
            className="size-5.5 transition-transform duration-200 ease-snap group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
