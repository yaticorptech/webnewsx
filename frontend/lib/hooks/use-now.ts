"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared "clock" that ticks every 30s so relative times ("3m ago") stay fresh without each
 * component owning an interval. Returns null on the server / during hydration.
 */
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((fn) => fn());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (!now) now = Date.now();
  return now;
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
