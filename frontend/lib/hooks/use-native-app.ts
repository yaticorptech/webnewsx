"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/native-app";

const noopSubscribe = () => () => {};

/** True inside the WebNEWS app once hydrated (false while server rendering, so the markup matches on both). */
export function useNativeApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
}

/**
 * Where the viewer's drafts live (owner 2026-10-09): in the app, Drafts is an option in Settings (not a tab on the
 * profile); on the website it's the profile's Drafts tab.
 */
export function draftsPath(username: string, inApp: boolean): string {
  return inApp ? "/settings?section=drafts" : `/${username}?tab=drafts`;
}
