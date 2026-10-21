"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type RefObject } from "react";
import { track } from "@/lib/track";
import { isReelPopupOpen, subscribeReelPopup } from "./reel-popup";

/*
 * Reel auto-scroll (owner 2026-09-26): with the toggle on, the reel on screen fills a thin progress bar and after 5 s
 * (video stories too: a reel is the story's poster, the clip plays on the story page) the page glides to the next reel.
 * The bar's CSS animation IS the timer — its `animationend` advances — so pausing is just `animation-play-state:
 * paused` and the bar never drifts from the clock.
 *
 *  - Preference: one switch, remembered in localStorage (read after hydration, so SSR markup always says "off").
 *  - ReelAutoplay: one per feed (React context). Reels register their element; an IntersectionObserver picks the
 *    active one (≥ 60% on screen). It pauses while the "Read full article" popup or any dialog / menu is open, while the
 *    phone's share sheet is up (share-button.tsx: it isn't in the DOM), while a finger or mouse button is down, while
 *    keyboard focus is inside the active reel, while the tab is hidden and while no reel is on screen; moving to
 *    another reel by hand restarts the timer there. At the end of the loaded reels it
 *    waits for the next page; at the true end of the feed it hands over to the feed (which turns the switch off).
 */

export const REEL_SECONDS = 5;
const REEL_MS = REEL_SECONDS * 1000;
const ACTIVE_RATIO = 0.6;
const STORAGE_KEY = "webnews:reel-autoscroll";
/** Anything modal or menu-like that is open in the DOM pauses the timer (share / report sheets, auth prompt, ⋯ menus). */
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/* ─────────────── Preference ─────────────── */

let preference = false;
let preferenceLoaded = false;
const preferenceListeners = new Set<() => void>();

function subscribePreference(listener: () => void) {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

function loadPreference() {
  if (preferenceLoaded) return;
  preferenceLoaded = true;
  try {
    preference = window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    preference = false;
  }
  if (preference) preferenceListeners.forEach((listener) => listener());
}

/** Turns auto-scroll on/off for every feed and remembers it (best effort: private windows may refuse storage). */
export function setAutoScroll(on: boolean): void {
  // Behaviour tracking (owner 2026-10-16): how many people use auto-scroll.
  if (on !== preference) track(on ? "autoscroll_on" : "autoscroll_off");
  preferenceLoaded = true;
  preference = on;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "on");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted; still applies to this page.
  }
  preferenceListeners.forEach((listener) => listener());
}

/** The auto-scroll switch. False on the server and during hydration; the stored value arrives right after. */
export function useAutoScrollPreference(): boolean {
  const on = useSyncExternalStore(
    subscribePreference,
    () => preference,
    () => false,
  );
  useEffect(loadPreference, []);
  return on;
}

/* ─────────────── Controller ─────────────── */

/** What the active reel's progress bar needs. A new object only when something changes. */
export type ReelTimer = {
  key: string;
  /** Increments to restart the bar (new reel, switch turned on, a stalled advance). */
  run: number;
  durationMs: number;
  playing: boolean;
};

type Target = { key: string; durationMs: number; ratio: number };

export type ReelFeedHooks = {
  hasNextPage: boolean;
  /** Load the next page (the reel list grows; the controller then moves on). */
  loadMore: () => void;
  /** The last reel of the whole feed has had its turn. */
  onEnd: () => void;
};

/**
 * Why the active reel's timer is held. `share`: the native share sheet is open (set by the share button); `radio`: the
 * News radio is reading (news-radio.tsx).
 */
export type PauseReason = "popup" | "overlay" | "share" | "pointer" | "touch" | "hidden" | "offscreen" | "radio";

export class ReelAutoplay {
  private targets = new Map<Element, Target>();
  private observer: IntersectionObserver | null = null;
  private listeners = new Set<() => void>();
  private enabled = false;
  private active: Element | null = null;
  private run = 0;
  private pauses = new Set<PauseReason>();
  /** The reel holding keyboard focus (:focus-visible), if any: the active one never moves away from under it. */
  private focusedReel: Element | null = null;
  private timer: ReelTimer | null = null;
  private waitingForMore = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private feed: ReelFeedHooks = { hasNextPage: false, loadMore: () => {}, onEnd: () => {} };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The running timer for `key`, or null when that reel isn't the active one (or auto-scroll is off). */
  timerFor = (key: string): ReelTimer | null => (this.timer?.key === key ? this.timer : null);

  setFeed(feed: ReelFeedHooks): void {
    this.feed = feed;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.waitingForMore = false;
    if (on) this.run += 1; // start the reel on screen from zero
    this.update();
  }

  setPaused(reason: PauseReason, paused: boolean): void {
    if (paused === this.pauses.has(reason)) return;
    if (paused) this.pauses.add(reason);
    else this.pauses.delete(reason);
    this.update();
  }

  setFocusedReel(reel: Element | null): void {
    if (reel === this.focusedReel) return;
    this.focusedReel = reel;
    this.update();
  }

  /** Watches one reel; returns the cleanup. `durationMs` = how long it stays on screen. */
  register(element: Element, key: string, durationMs: number): () => void {
    this.targets.set(element, { key, durationMs, ratio: 0 });
    this.getObserver().observe(element);
    if (this.waitingForMore) {
      // The next page arrived while the last reel waited: move on once the whole batch has registered.
      this.waitingForMore = false;
      queueMicrotask(() => this.advance());
    }
    return () => {
      this.observer?.unobserve(element);
      this.targets.delete(element);
      if (this.active === element) {
        this.active = null;
        this.pickActive();
      }
    };
  }

  /** The active reel's bar finished (`run` guards against a bar from an earlier run). */
  done(key: string, run: number): void {
    if (!this.timer || this.timer.key !== key || this.timer.run !== run || !this.timer.playing) return;
    this.advance();
  }

  /** The feed unmounted. Reels unregister themselves; only the stalled-advance retry can still be pending. */
  dispose(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.waitingForMore = false;
  }

  private getObserver(): IntersectionObserver {
    this.observer ??= new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const target = this.targets.get(record.target);
          if (target) target.ratio = record.isIntersecting ? record.intersectionRatio : 0;
        }
        this.pickActive();
      },
      { threshold: [0, 0.25, 0.5, ACTIVE_RATIO, 0.75, 0.9, 1] },
    );
    return this.observer;
  }

  /** The most visible reel (≥ 60%) becomes active; with none on screen the last one stays, paused. */
  private pickActive(): void {
    let best: Element | null = null;
    let bestRatio = 0;
    for (const [element, target] of this.targets) {
      if (target.ratio >= ACTIVE_RATIO && target.ratio > bestRatio) {
        best = element;
        bestRatio = target.ratio;
      }
    }
    if (best && best !== this.active) {
      // Moved on (by hand or by the glide): a fresh timer on the new reel.
      this.active = best;
      this.run += 1;
      this.waitingForMore = false;
      if (this.retry) clearTimeout(this.retry);
    }
    if (best) this.pauses.delete("offscreen");
    else this.pauses.add("offscreen");
    this.update();
  }

  private advance(): void {
    const ordered = [...this.targets.keys()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const index = this.active ? ordered.indexOf(this.active) : -1;
    const next = ordered[index + 1];
    if (next) {
      const from = this.active;
      track("autoscroll_advance", { articleId: from?.getAttribute("data-feed-item") ?? undefined });
      next.scrollIntoView({ behavior: "smooth", block: "start" });
      // The glide got interrupted (a touch, a layout jump) and the same reel is still up: give it another turn.
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        this.retry = null;
        if (this.active === from) {
          this.run += 1;
          this.update();
        }
      }, 1500);
      return;
    }
    if (this.feed.hasNextPage) {
      this.waitingForMore = true;
      this.feed.loadMore();
      return;
    }
    this.feed.onEnd();
  }

  /** Recomputes the active reel's timer and notifies subscribers when it changed. */
  private update(): void {
    const target = this.active ? this.targets.get(this.active) : undefined;
    const playing = this.pauses.size === 0 && this.focusedReel !== this.active;
    const next: ReelTimer | null =
      this.enabled && target ? { key: target.key, run: this.run, durationMs: target.durationMs, playing } : null;
    const prev = this.timer;
    const same =
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.key === next.key &&
        prev.run === next.run &&
        prev.durationMs === next.durationMs &&
        prev.playing === next.playing);
    if (same) return;
    this.timer = next;
    this.listeners.forEach((listener) => listener());
  }
}

const ReelAutoplayContext = createContext<ReelAutoplay | null>(null);

/** Provides a feed's controller to its reels. Reels outside a provider (under a story) have no auto-scroll. */
export const ReelAutoplayProvider = ReelAutoplayContext.Provider;

/** The feed's controller, or null outside a feed: lets controls inside a reel pause it (`setPaused`). */
export const useReelAutoplayController = (): ReelAutoplay | null => useContext(ReelAutoplayContext);

/** Registers a reel with the feed's controller (no-op without one). `durationMs` = its time on screen (5 s). */
export function useReelTarget(ref: RefObject<Element | null>, key: string, durationMs = REEL_MS): void {
  const controller = useContext(ReelAutoplayContext);
  useEffect(() => {
    const element = ref.current;
    if (!controller || !element) return;
    return controller.register(element, key, durationMs);
  }, [controller, ref, key, durationMs]);
}

const noopSubscribe = () => () => {};

/** This reel's running timer (null unless it's the active reel with auto-scroll on) + the "finished" callback. */
export function useReelTimer(key: string): { timer: ReelTimer | null; done: (run: number) => void } {
  const controller = useContext(ReelAutoplayContext);
  const timer = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    () => controller?.timerFor(key) ?? null,
    () => null,
  );
  return { timer, done: (run) => controller?.done(key, run) };
}

/**
 * Wires a feed's controller to the page: the switch, the next-page / end hooks, and the pause signals (popup,
 * dialogs and menus, pointer or finger down, keyboard focus in a reel, hidden tab). Listeners only exist while
 * auto-scroll is on.
 */
export function useReelAutoplay(controller: ReelAutoplay, enabled: boolean, feed: ReelFeedHooks): void {
  useEffect(() => {
    controller.setFeed(feed);
  });

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    controller.setEnabled(enabled);
    if (!enabled) return;

    const syncPopup = () => controller.setPaused("popup", isReelPopupOpen());
    // Only overlays actually on screen count (a closed menu left in the DOM, or the dev tools', mustn't hold it).
    const syncOverlay = () =>
      controller.setPaused(
        "overlay",
        [...document.querySelectorAll(OVERLAY_SELECTOR)].some((el) => el.getClientRects().length > 0 && !el.closest("nextjs-portal")),
      );
    const syncHidden = () => controller.setPaused("hidden", document.visibilityState === "hidden");
    const pointerDown = () => controller.setPaused("pointer", true);
    const pointerUp = () => controller.setPaused("pointer", false);
    const touchDown = () => controller.setPaused("touch", true);
    const touchUp = (event: TouchEvent) => {
      if (event.touches.length === 0) controller.setPaused("touch", false);
    };
    const released = () => {
      controller.setPaused("pointer", false);
      controller.setPaused("touch", false);
    };
    // Tabbing through a reel's controls: don't move the reel away from under the keyboard focus.
    const syncFocus = () => {
      const focused = document.activeElement;
      // The rail's buttons (Like, Share, the auto-scroll switch itself) don't count: tapping them must not stop the bar.
      const keyboard = focused instanceof Element && focused.matches(":focus-visible") && !focused.closest("[data-reel-rail]");
      controller.setFocusedReel(keyboard ? focused.closest(".reel") : null);
    };
    const focusLeft = () => setTimeout(syncFocus, 0);

    syncPopup();
    syncOverlay();
    syncHidden();
    syncFocus();
    const unsubscribePopup = subscribeReelPopup(syncPopup);
    const overlays = new MutationObserver(syncOverlay);
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "open"] });
    document.addEventListener("visibilitychange", syncHidden);
    window.addEventListener("pointerdown", pointerDown, { passive: true });
    window.addEventListener("pointerup", pointerUp, { passive: true });
    // A lost pointerup / touchend (the swipe handler, a capture) must not leave the bar frozen.
    window.addEventListener("click", released, { passive: true });
    window.addEventListener("scrollend", released, { passive: true });
    window.addEventListener("pointercancel", pointerUp, { passive: true });
    window.addEventListener("touchstart", touchDown, { passive: true });
    window.addEventListener("touchend", touchUp, { passive: true });
    window.addEventListener("touchcancel", touchUp, { passive: true });
    window.addEventListener("blur", released);
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", focusLeft);
    return () => {
      unsubscribePopup();
      overlays.disconnect();
      document.removeEventListener("visibilitychange", syncHidden);
      window.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("click", released);
      window.removeEventListener("scrollend", released);
      window.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("touchstart", touchDown);
      window.removeEventListener("touchend", touchUp);
      window.removeEventListener("touchcancel", touchUp);
      window.removeEventListener("blur", released);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", focusLeft);
      controller.setFocusedReel(null);
      for (const reason of ["popup", "overlay", "share", "pointer", "touch", "hidden"] as const) controller.setPaused(reason, false);
    };
  }, [controller, enabled]);
}
