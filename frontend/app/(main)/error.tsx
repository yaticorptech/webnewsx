"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/layout/status-views";

/*
 * A backend restart (a deploy, or the dev server reloading) makes pages fail for a few seconds. The boundary retries
 * on its own a moment later — at most 3 times in 30 s across the app, so a real error can't loop — and "Try again"
 * stays for the reader.
 */
const AUTO_RETRY_DELAY_MS = 2_500;
const AUTO_RETRY_WINDOW_MS = 30_000;
const AUTO_RETRY_MAX = 3;
const autoRetries: number[] = [];

function mayAutoRetry(): boolean {
  const now = Date.now();
  while (autoRetries.length > 0 && now - autoRetries[0]! > AUTO_RETRY_WINDOW_MS) autoRetries.shift();
  if (autoRetries.length >= AUTO_RETRY_MAX) return false;
  autoRetries.push(now);
  return true;
}

/**
 * The site was updated while this page stayed open (a deploy, or the dev server rebuilding — common in the phone app,
 * which stays open for long): the next page's code is gone, so only a fresh load helps. Once per minute at most.
 */
const STALE_CODE = /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RELOAD_KEY = "webnews:stale-reload";

function reloadForStaleCode(error: Error): boolean {
  if (!STALE_CODE.test(`${error.name} ${error.message}`)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Error boundary inside the app shell: nav, ticker and rail stay usable. */
export default function MainError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reloadForStaleCode(error);
  }, [error]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mayAutoRetry()) retry();
    }, AUTO_RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [error, retry]);

  return <ErrorView onRetry={retry} digest={error.digest} />;
}
