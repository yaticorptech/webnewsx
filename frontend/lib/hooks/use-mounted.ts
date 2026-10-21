"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it to gate output that depends
 * on browser-only state (theme from localStorage, media queries) without hydration mismatches.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
