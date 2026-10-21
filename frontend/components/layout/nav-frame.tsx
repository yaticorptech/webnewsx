"use client";

import { useEffect, type ReactNode } from "react";
import { useReelFeed } from "@/components/providers/feed-layout-provider";
import { usePhoneLayout } from "@/components/providers/phone-layout-provider";
import { reelZoneReached } from "@/components/feed/reel-scroll";
import { useHideOnScroll } from "@/lib/hooks/use-hide-on-scroll";
import { usePathname } from "next/navigation";
import { isFeedPath } from "@/components/feed/feed-views";

export type NavFrameProps = {
  /** The sticky part: the top bar. */
  children: ReactNode;
  /** The sections row (feed pages): under the bar, sticky with it — except on phones over the photo cards (below). */
  chips?: ReactNode;
};

/**
 * Masthead frame. The <header> is `display: contents` so it stays the page's single banner landmark
 * while its sticky bar sticks to the page (a sticky child can't outlive a normal parent box). On
 * phones (<768px) the sticky bar slides away while scrolling down and returns on scroll up —
 * except on feed pages and once a story's "More from" reels are reached: reels are sized to the space
 * under the bar (components/feed/reel-card.tsx). `data-hidden` on the header lets other UI follow it
 * (e.g. the "new stories" pill). The zero-height `data-snap-top` marker keeps the page top a scroll-snap
 * stop on reel feeds (globals.css, "Reel feed"). From 768px the bar always shows (redesign 2026-10-07: one row,
 * no big masthead row any more). Solid white, no blur: a blur is redrawn on every scroll frame (owner 2026-10-07: lag).
 */
export function NavFrame({ children, chips }: NavFrameProps) {
  const reelFeed = useReelFeed();
  // Phones, except over the reels (owner 2026-10-09): the sections row scrolls away with the page and only shows again
  // at the top — scrolling back up part of the way brings back the bar, not the row. Elsewhere it sticks with the bar.
  const chipsInFlow = usePhoneLayout() && !reelFeed;
  // Home and the category feeds in the grid (owner 2026-10-16): the logo bar stays; only the sections row scrolls away.
  const feedPage = isFeedPath(usePathname());
  const hidden = useHideOnScroll({ media: "(max-width: 767.98px)", offset: 96, enabled: !reelFeed && !feedPage, pinned: reelZoneReached });
  // Desktop (owner 2026-10-15): scrolling down slides the tall masthead (utility row + logo) away, leaving the section
  // menu pinned at the top; scrolling up brings it back. Not over the reels (sized to the space under the bar).
  // The full masthead comes back the moment the reader scrolls up (owner 2026-10-15: "immediately") — tolerance 1px.
  const compact = useHideOnScroll({ media: "(min-width: 1024px)", offset: 140, tolerance: 1, enabled: !reelFeed });
  useReelChipsAutoHide(reelFeed);

  return (
    <header className="contents" data-hidden={hidden || undefined}>
      <span aria-hidden data-snap-top className="block h-0" />
      <div
        data-masthead-bar=""
        data-hidden={hidden || undefined}
        data-compact={compact || undefined}
        className="sticky top-(--safe-top) z-50 bg-surface transition-transform duration-200 ease-snap data-hidden:-translate-y-full lg:data-compact:-translate-y-(--bar-h) motion-reduce:transition-none"
      >
        {/* Above the sections row, which slides up under it over the phone reels (useReelChipsAutoHide). */}
        <div className="relative z-10 bg-surface">{children}</div>
        {!chipsInFlow && chips}
      </div>
      {/* data-chips-flow: globals.css then leaves the row out of --nav-h (only the bar sticks). */}
      {chipsInFlow && chips && <div data-chips-flow="">{chips}</div>}
    </header>
  );
}

/** Where a reel settles (the reels, then loading / the end of the feed), as in reel-scroll.ts. */
const STOPS = "[data-reel-feed] .reel, [data-reel-feed] .reel-snap";
/** The masthead's slide away / back. */
const SLIDE_MS = 300;
const topOf = (el: Element) => window.scrollY + el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Phones over the reels (owner 2026-10-16): moving on to a later reel slides the whole masthead (logo bar + sections)
 * up out of sight, going back (or to the page top) slides it down again — and a reel always fills exactly the
 * space between the masthead and the tab bar, one reel per screen. Those sizes are MEASURED (the masthead, the tab bar,
 * the screen) and written to --nav-h / --reel-h on <html>. The slide itself only moves things (transform, on the GPU):
 * the masthead, and the feed with it so the reel on screen rides along; the reels are resized once — at the end of a hide,
 * at the start of a show. Decided once the page settles, never mid-swipe.
 */
function useReelChipsAutoHide(enabled: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) return;
    const phone = window.matchMedia("(max-width: 639.98px)");
    let lastY = window.scrollY;
    let timer = 0;
    let touching = false;
    let frame = 0;
    let hidden = false;

    const bar = () => document.querySelector<HTMLElement>("[data-masthead-bar]");
    const feed = () => document.querySelector<HTMLElement>("[data-reel-feed]");
    const reset = () => {
      for (const el of [bar(), feed()]) {
        if (!el) continue;
        for (const prop of ["transform", "transition", "will-change"]) el.style.removeProperty(prop);
      }
    };
    const clear = () => {
      root.style.removeProperty("--nav-h");
      root.style.removeProperty("--reel-h");
      reset();
    };
    /** --nav-h / --reel-h from the masthead as it is now laid out. */
    const apply = () => {
      const el = bar();
      if (!el || !phone.matches) return clear();
      const safeTop = parseFloat(getComputedStyle(el).top) || 0;
      const tabs = document.querySelector('nav[aria-label="Primary"]');
      const bottom = tabs && tabs.getBoundingClientRect().height > 0 ? tabs.getBoundingClientRect().top : window.innerHeight;
      const navH = safeTop + (hidden ? 0 : el.offsetHeight);
      root.style.setProperty("--nav-h", `${navH}px`);
      root.style.setProperty("--reel-h", `${Math.max(240, bottom - navH)}px`);
    };
    const anchorNow = () => {
      let anchor: Element | null = null;
      let best = Infinity;
      for (const el of document.querySelectorAll(STOPS)) {
        const away = Math.abs(topOf(el) - window.scrollY);
        if (away < best) {
          best = away;
          anchor = el;
        }
      }
      return anchor;
    };

    const setHidden = (hide: boolean) => {
      if (hide === hidden) return;
      const el = bar();
      if (!el) return;
      hidden = hide;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const list = feed();
      // The reel on screen stays put (none at the page top: nothing to keep in place there).
      const anchor = window.scrollY > 1 ? anchorNow() : null;
      if (!hide) {
        // Show: the reels take their smaller size now — the masthead and the feed start shifted up by its height.
        apply();
        if (anchor) window.scrollTo({ top: topOf(anchor), behavior: "instant" });
      }
      const height = el.offsetHeight;
      const move = (offset: number) => {
        const value = offset ? `translateY(${-offset}px)` : "";
        el.style.transform = value;
        if (list && anchor) list.style.transform = value;
      };
      el.style.transition = "none"; // the slide is driven here, frame by frame
      el.style.willChange = "transform";
      if (list && anchor) list.style.willChange = "transform";
      root.style.scrollSnapType = "none";
      if (!hide) move(height);
      const started = performance.now();
      const step = (now: number) => {
        const t = ease(Math.min(1, (now - started) / SLIDE_MS));
        move(height * (hide ? t : 1 - t));
        if (now - started < SLIDE_MS) {
          frame = requestAnimationFrame(step);
          return;
        }
        frame = 0;
        list?.style.removeProperty("transform");
        if (hide) {
          // Hide: the masthead stays slid away; the reels grow into its height in one go.
          apply();
          if (anchor) window.scrollTo({ top: topOf(anchor), behavior: "instant" });
        } else el.style.removeProperty("transform");
        el.style.removeProperty("will-change");
        list?.style.removeProperty("will-change");
        root.style.removeProperty("scroll-snap-type");
        lastY = window.scrollY;
      };
      frame = requestAnimationFrame(step);
    };

    const settle = () => {
      timer = 0;
      if (touching || frame || !phone.matches) return;
      const y = window.scrollY;
      if (y <= 1) setHidden(false);
      else if (y > lastY + 40) setHidden(true);
      else if (y < lastY - 40) setHidden(false);
      lastY = window.scrollY;
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 150);
    };
    const down = () => {
      touching = true;
    };
    const up = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touching = false;
      onScroll();
    };
    // Screen size / rotation / the browser's address bar: measure again and keep the reel on screen lined up.
    const resize = () => {
      if (frame) return;
      const anchor = window.scrollY > 1 ? anchorNow() : null;
      apply();
      if (anchor) window.scrollTo({ top: topOf(anchor), behavior: "instant" });
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    window.addEventListener("touchcancel", up, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("scroll-snap-type");
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      window.removeEventListener("resize", resize);
      clear();
    };
  }, [enabled]);
}
