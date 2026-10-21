"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { askPremium } from "./premium-gate";
import { DOUBLE_TAP_MS } from "./story-cover";

/*
 * "Read full article →" popup for reels: a single tap anywhere on a reel that isn't a control shows a small floating
 * pill near the finger, on the reel's poster; it links to the story. One popup on the page at a time (this
 * module-level store); it hides after a few seconds, on scroll, on Escape and on a tap anywhere else. The reel's
 * auto-scroll pauses while it's open.
 */

export type ReelPopupState = {
  /** The reel instance it belongs to (`useId` of the ReelCard). */
  reelKey: string;
  /** Tap point relative to the top-left corner of the reel's poster (its `data-reel-popup-host`), px. */
  x: number;
  y: number;
  /** New for every opening, so a second tap elsewhere animates a fresh pill. */
  id: number;
};

const AUTO_HIDE_MS = 4_000;
/** Scrolling further than this (px) since the popup opened closes it (ignores sub-pixel snap settling). */
const SCROLL_CLOSE_PX = 24;

let current: ReelPopupState | null = null;
let seq = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let openedAtY = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const onScroll = () => {
  if (Math.abs(window.scrollY - openedAtY) > SCROLL_CLOSE_PX) closeReelPopup();
};
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") closeReelPopup();
};
// A tap anywhere but on the pill closes it (a tap elsewhere on a reel then opens a new one there).
const onPointerDown = (event: PointerEvent) => {
  if (!(event.target instanceof Element) || !event.target.closest("[data-reel-popup]")) closeReelPopup();
};

function startHideTimer(ms: number) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => closeReelPopup(), ms);
}

/** Shows the popup on one reel (closing any other). */
export function openReelPopup(reelKey: string, x: number, y: number): void {
  if (!current) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
  }
  openedAtY = window.scrollY;
  current = { reelKey, x, y, id: ++seq };
  startHideTimer(AUTO_HIDE_MS);
  emit();
}

/** Hides the popup — only if it belongs to `reelKey`, when given. */
export function closeReelPopup(reelKey?: string): void {
  if (!current || (reelKey !== undefined && current.reelKey !== reelKey)) return;
  current = null;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("pointerdown", onPointerDown, true);
  emit();
}

/** Subscribe to "is any reel popup open" (auto-scroll pauses meanwhile). */
export function subscribeReelPopup(listener: () => void): () => void {
  return subscribe(listener);
}

export function isReelPopupOpen(): boolean {
  return current !== null;
}

/** This reel's popup, or null. Other reels don't re-render when it opens or moves. */
function useReelPopup(reelKey: string): ReelPopupState | null {
  return useSyncExternalStore(
    subscribe,
    () => (current?.reelKey === reelKey ? current : null),
    () => null,
  );
}

/** Controls, the action rail around them and anything that already does something on click never open the popup. */
const INTERACTIVE = [
  "[data-reel-rail]",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  '[contenteditable="true"]',
  ...["button", "link", "menu", "menuitem", "dialog", "alertdialog"].map((role) => `[role="${role}"]`),
].join(", ");

/**
 * Click handler for a reel: a single tap/click on a non-interactive spot opens the popup at that point (clamped onto
 * the poster) once the double-tap window has passed — a second tap inside it (the poster's double-tap like) cancels it.
 * Selecting text doesn't count; Cmd/Ctrl/Shift/middle click opens the story in a new tab. Closes this reel's popup when
 * unmounted.
 */
export function useReelTap(reelKey: string, href: string): (event: MouseEvent<HTMLElement>) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      closeReelPopup(reelKey);
    },
    [reelKey],
  );

  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const reel = event.currentTarget;
      const target = event.target;
      // React portals (sheets, dialogs) bubble through the reel without being inside it.
      if (!(target instanceof Element) || !reel.contains(target)) return;
      const control = target.closest(INTERACTIVE);
      if (event.defaultPrevented || (control && reel.contains(control))) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
        window.open(href, "_blank", "noopener");
        return;
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && reel.contains(selection.anchorNode)) return;

      const now = event.timeStamp;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      const rect = (reel.querySelector("[data-reel-popup-host]") ?? reel).getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      timer.current = setTimeout(() => {
        timer.current = null;
        openReelPopup(reelKey, x, y);
      }, DOUBLE_TAP_MS);
    },
    [href, reelKey],
  );
}

export type ReadFullPopupProps = {
  reelKey: string;
  href: string;
  /** `href` is the story's Read more link: opens in a new tab. */
  external?: boolean;
  /** A members-only story the viewer can't read: the "buy premium" popup instead. */
  gate?: Parameters<typeof askPremium>[0] | null;
  title: string;
};

/** Space kept between the pill and the reel's action rail (px). */
const CLEARANCE = 8;
/** The closest the pill gets to the poster's left edge when it moves aside for the rail (px). */
const EDGE = 4;

type Box = { left: number; right: number; top: number; bottom: number };

/** Are two boxes at least CLEARANCE apart? */
const apart = (a: Box, b: Box) =>
  a.right <= b.left - CLEARANCE || a.left >= b.right + CLEARANCE || a.bottom <= b.top - CLEARANCE || a.top >= b.bottom + CLEARANCE;

/**
 * The floating "Read full article →" pill (brand red, a real link), just above the tap point and kept on the poster
 * (render it inside the reel's `data-reel-popup-host`). Pops in with a spring — also under Reduce Motion (owner rule:
 * key animations always run; the app's MotionConfig would otherwise drop the scale). Hovering it with a mouse holds it
 * open.
 */
export function ReadFullPopup({ reelKey, href, external = false, gate = null, title }: ReadFullPopupProps) {
  const popup = useReelPopup(reelKey);
  return (
    <MotionConfig reducedMotion="never">
      <AnimatePresence>{popup && <PopupPill key={popup.id} popup={popup} href={href} external={external} gate={gate} title={title} />}</AnimatePresence>
    </MotionConfig>
  );
}

/**
 * One opening of the pill. The reel's action rail (reel-controls.tsx; on phones it lies over the poster's right edge)
 * can sit where the pill would go: before the first paint the pill slides left, and when the poster is too narrow for
 * that, rises above the rail's top edge.
 */
function PopupPill({
  popup,
  href,
  external,
  gate,
  title,
}: {
  popup: ReelPopupState;
  href: string;
  external: boolean;
  gate: Parameters<typeof askPremium>[0] | null;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  /** null = the usual spot; else how far (px) the pill moves right (+x) / left (−x) and down (+y) / up (−y). */
  const [dodge, setDodge] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // The box is the pill plus its gap to the tap point (bottom padding); its bottom edge is the tap point.
    const own = box.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(box).paddingBottom) || 0;
    const pill: Box = { left: own.left, right: own.right, top: own.top, bottom: own.bottom - gap };
    let x = 0;
    let y = 0;

    const rail = box.closest(".reel")?.querySelector("[data-reel-rail]")?.getBoundingClientRect();
    if (rail && !apart(pill, rail)) {
      const host = box.offsetParent?.getBoundingClientRect();
      x = Math.max(rail.left - CLEARANCE - pill.right, (host?.left ?? 0) + EDGE - pill.left);
      pill.left += x;
      pill.right += x;
      if (!apart(pill, rail)) {
        const up = rail.top - CLEARANCE - pill.bottom;
        if (pill.top + up >= (host?.top ?? 0) + EDGE) y = up;
      }
    }

    if (x !== 0 || y !== 0) setDodge({ x, y });
  }, []);

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full pb-3"
      // Half the pill's width (+ a margin) from the sides; the pill's height from the top.
      style={{
        left: `clamp(7.25rem, ${popup.x}px, calc(100% - 7.25rem))`,
        top: `clamp(4.5rem, ${popup.y}px, calc(100% - 0.5rem))`,
        marginLeft: dodge?.x,
        marginTop: dodge?.y,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 4, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 520, damping: 30 }}
        className="origin-bottom"
      >
        <Link
          href={href}
          {...(external && { target: "_blank", rel: "noopener noreferrer" })}
          data-reel-popup
          onClick={(event) => {
            closeReelPopup();
            if (gate && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
              event.preventDefault();
              askPremium(gate);
            }
          }}
          // Only a hovering mouse holds it open: a touch press that never becomes a click must not keep it (and the
          // paused auto-scroll) up for good.
          onPointerEnter={(event) => event.pointerType === "mouse" && hideTimer && clearTimeout(hideTimer)}
          onPointerLeave={(event) => event.pointerType === "mouse" && startHideTimer(2_000)}
          className={cn(
            "group/pop pointer-events-auto inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand pl-5 pr-4",
            "font-wide text-sm font-extrabold text-brand-contrast shadow-pop outline-offset-4 transition-colors hover:bg-brand-hover",
          )}
        >
          Read full article
          <span className="sr-only">: {title}</span>
          <ArrowRight
            aria-hidden
            strokeWidth={2.75}
            className="size-4 transition-transform duration-200 ease-snap group-hover/pop:translate-x-0.5"
          />
        </Link>
      </motion.div>
    </div>
  );
}
