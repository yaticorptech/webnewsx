"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { isNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** How far the finger moves before the pull starts (px): a tap or a sideways swipe never starts one. */
const SLOP = 10;
/** The indicator's travel (px) that reloads on release; it follows the finger at half speed, up to MAX. */
const THRESHOLD = 72;
const MAX = 112;
/** Where the indicator rests while the page refreshes. */
const HOLD = 56;
const SIZE = 40;

/** Forms and the story composer: a stray pull must never throw away what someone is typing. */
function isGuarded(target: EventTarget | null, pathname: string): boolean {
  if (pathname.startsWith("/publish")) return true;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], form"));
}

/** True if the touch starts inside a box that is scrolled down (it scrolls back up first, the page doesn't reload). */
function inScrolledBox(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/** The spinner stays at least this long, so a quick refresh doesn't blink. */
const MIN_SPIN_MS = 450;

/**
 * Swipe down at the top of any page to refresh it — in the WebNEWS app (owner 2026-09-29) and, since the reels take
 * over the browser's own touch handling, in phone browsers too (owner 2026-10-05: it didn't work on the website), in
 * place of the browser's. On computers (owner 2026-10-05) the same pull with the trackpad or mouse wheel: scrolling up
 * at the very top (not a scroll still gliding into the top). Not while a dialog is open, inside a scrolled box, or on
 * forms and the composer.
 * The page stays on screen while it refreshes (owner 2026-10-02: no skeleton): the server parts re-render
 * (router.refresh) and the data on screen is fetched again, then swapped in — a full reload would show the loading
 * skeleton until everything arrived.
 */
/** The app, or a phone / tablet browser (touch screen). */
const touchDevice = () => isNativeApp() || window.matchMedia("(pointer: coarse)").matches;

export function PullToRefresh() {
  const enabled = useSyncExternalStore(noopSubscribe, touchDevice, () => false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [travel, setTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reloading, setReloading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startRefresh] = useTransition();
  /** True while a refresh runs: no new pull until it's done. */
  const busy = useRef(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    refreshRef.current = () => {
      busy.current = true;
      const started = Date.now();
      startRefresh(async () => {
        await queryClient.refetchQueries({ type: "active" }).catch(() => {});
        router.refresh();
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_SPIN_MS - (Date.now() - started))));
        busy.current = false;
        setReloading(false);
        setTravel(0);
      });
    };
  }, [queryClient, router]);

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let active = false;
    let current = 0;

    const reset = () => {
      start = null;
      active = false;
      current = 0;
      setDragging(false);
      setTravel(0);
    };

    const onStart = (event: TouchEvent) => {
      start = null;
      if (busy.current || event.touches.length !== 1 || window.scrollY > 0) return;
      // A dialog, sheet or the photo viewer is open (they lock the page's scroll).
      if (document.documentElement.style.overflow === "hidden" || document.querySelector("[aria-modal='true']")) return;
      if (isGuarded(event.target, pathRef.current) || inScrolledBox(event.target)) return;
      const touch = event.touches[0]!;
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!active) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Sideways (chip rows, carousels) or upwards: an ordinary swipe.
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
          start = null;
          return;
        }
        active = true;
        setDragging(true);
      }
      if (dy <= 0) {
        reset();
        return;
      }
      // The page is at its top: the pull replaces the browser's overscroll stretch.
      if (event.cancelable) event.preventDefault();
      current = Math.min(MAX, (dy - SLOP) / 2);
      setTravel(current);
    };

    const onEnd = () => {
      if (!active) {
        start = null;
        return;
      }
      if (current >= THRESHOLD) {
        start = null;
        active = false;
        current = 0;
        setDragging(false);
        setTravel(HOLD);
        setReloading(true);
        refreshRef.current();
        return;
      }
      reset();
    };

    // A blocking (non-passive) touchmove listener makes the browser wait for this script on every finger move before
    // it scrolls — scrolling lags whenever the page is busy (owner 2026-10-07). A pull only starts at the very top, so
    // the listener is there only while the page is at its top; anywhere else scrolling stays with the browser.
    let blocking = false;
    const syncBlocking = () => {
      const atTop = window.scrollY <= 0;
      if (atTop === blocking) return;
      blocking = atTop;
      if (atTop) window.addEventListener("touchmove", onMove, { passive: false });
      else window.removeEventListener("touchmove", onMove);
    };
    syncBlocking();

    window.addEventListener("scroll", syncBlocking, { passive: true });
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("scroll", syncBlocking);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [enabled]);

  // Computers: the pull is a trackpad / wheel scroll upwards at the very top of the page.
  useEffect(() => {
    if (!mounted || enabled) return;
    let pull = 0;
    let lastScrollAt = 0;
    let lastWheelAt = 0;
    /** A wheel run that began as a scroll gliding into the top: ignored until the wheel pauses. */
    let ignoring = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (idle) clearTimeout(idle);
      idle = null;
      pull = 0;
      setDragging(false);
      setTravel(0);
    };
    const finish = () => {
      idle = null;
      if (pull >= THRESHOLD && !busy.current) {
        pull = 0;
        setDragging(false);
        setTravel(HOLD);
        setReloading(true);
        refreshRef.current();
      } else clear();
    };
    const onScroll = () => {
      lastScrollAt = performance.now();
    };
    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      const gap = now - lastWheelAt;
      lastWheelAt = now;
      if (gap > 150) ignoring = false;
      if (busy.current || event.ctrlKey || ignoring) return;
      if (window.scrollY > 0 || event.deltaY >= 0) {
        if (pull > 0) clear();
        return;
      }
      if (pull === 0 && now - lastScrollAt < 350) {
        ignoring = true;
        return;
      }
      if (document.documentElement.style.overflow === "hidden" || document.querySelector("[aria-modal='true']")) return;
      if (isGuarded(event.target, pathRef.current) || inScrolledBox(event.target)) return;
      const delta = -event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      pull = Math.min(MAX, pull + Math.min(40, delta) / 3);
      setDragging(true);
      setTravel(pull);
      if (idle) clearTimeout(idle);
      idle = setTimeout(finish, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      if (idle) clearTimeout(idle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
    };
  }, [mounted, enabled]);

  if (!mounted) return null;
  // Refreshing (owner 2026-10-14): the loader sits in the middle of the screen over the blurred page.
  if (reloading) {
    return (
      // The page behind is blurred while it refreshes (owner 2026-10-14).
      <div role="status" className="fixed inset-0 z-60 flex items-center justify-center bg-surface/30 backdrop-blur-sm">
        <span className="flex size-14 animate-fade-up items-center justify-center rounded-full border border-border bg-surface shadow-pop">
          <SpeedLinesLoader size="sm" label="Refreshing" />
        </span>
      </div>
    );
  }
  const armed = travel >= THRESHOLD;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed left-1/2 top-(--safe-top) z-60 flex items-center justify-center rounded-full border border-border bg-surface shadow-pop",
        !dragging && "transition-[translate,opacity] duration-200 ease-snap",
      )}
      style={{
        width: SIZE,
        height: SIZE,
        marginLeft: -SIZE / 2,
        translate: `0 ${travel - SIZE - 4}px`,
        opacity: travel > 0 ? Math.min(1, travel / (THRESHOLD * 0.6)) : 0,
      }}
    >
      <RefreshCw
        aria-hidden
        className={cn("size-5 transition-colors", armed ? "text-brand" : "text-muted")}
        style={{ rotate: `${(travel / THRESHOLD) * 270}deg` }}
      />
    </div>
  );
}
