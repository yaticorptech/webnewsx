"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/native-app";

const noopSubscribe = () => () => {};

/** True inside the WebNEWS app once hydrated (false while server rendering, so the markup matches on both). */
export function useNativeApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
}

/**
 * Where the viewer's drafts live: the profile's Drafts tab, in the app too (owner 2026-10-31, was Settings-only in the
 * app since 2026-10-09; Settings → Drafts stays as well).
 */
export function draftsPath(username: string): string {
  return `/${username}?tab=drafts`;
}
