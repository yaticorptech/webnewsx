"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared wall clock that ticks on each whole second while the tab is visible (paused when hidden,
 * re-synced on return). Returns null on the server / during hydration so markup never mismatches.
 */
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function tick() {
  now = Date.now();
  listeners.forEach((fn) => fn());
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (listeners.size === 0 || document.visibilityState === "hidden") return;
  // Align to the next whole second so every clock on the page flips together.
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

function onVisibility() {
  if (document.visibilityState === "visible") tick();
  else schedule();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    now = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (!now) now = Date.now();
  return now;
}

export function useClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
