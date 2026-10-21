"use client";

import { useEffect, type RefObject } from "react";
import { api, isApiError } from "@/lib/api";

/*
 * View counting (SPEC §5.4): a card counts once it has been ≥ 50% visible for ≥ 1 s while the
 * tab is visible. Ids are batched and flushed every 3 s and when the page is hidden (keepalive).
 * The backend dedupes per viewer; this module also remembers what it already sent this session
 * so scrolling back and forth never re-sends.
 */

const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1_000;
const FLUSH_MS = 3_000;
const MAX_BATCH = 50;

const sent = new Set<string>();
const pending = new Set<string>();
const dwellTimers = new Map<Element, ReturnType<typeof setTimeout>>();
const targets = new Map<Element, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let observer: IntersectionObserver | null = null;
let pageHooksInstalled = false;

function scheduleFlush(): void {
  if (flushTimer || pending.size === 0) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushViews();
  }, FLUSH_MS);
}

/** Sends every queued id now (batches of ≤ 50). */
export async function flushViews(keepalive = false): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (pending.size > 0) {
    const batch = Array.from(pending).slice(0, MAX_BATCH);
    batch.forEach((id) => {
      pending.delete(id);
      sent.add(id);
    });
    try {
      await api.views(batch, { keepalive });
    } catch (error) {
      // Network hiccup: try again on the next flush. Anything else (429, 400) is dropped.
      if (isApiError(error) && error.isNetworkError) {
        batch.forEach((id) => {
          sent.delete(id);
          pending.add(id);
        });
        scheduleFlush();
      }
      return;
    }
  }
}

function installPageHooks(): void {
  if (pageHooksInstalled || typeof document === "undefined") return;
  pageHooksInstalled = true;
  const flushOnHide = () => {
    if (document.visibilityState === "hidden") void flushViews(true);
  };
  document.addEventListener("visibilitychange", flushOnHide);
  window.addEventListener("pagehide", () => void flushViews(true));
}

/** Queue one view (deduped for the session). */
export function queueView(id: string): void {
  if (sent.has(id) || pending.has(id)) return;
  installPageHooks();
  pending.add(id);
  scheduleFlush();
}

/** Count a view right away (article page open). Resolves once the batch has been sent. */
export function countViewNow(id: string): Promise<void> {
  queueView(id);
  return flushViews();
}

const readsSent = new Set<string>();

/**
 * The article page is actually open: count a Newsroom "read" (once per story per page load; the backend keeps it
 * unique per viewer). Rendering or prefetching the page never counts — only this call from the mounted view.
 */
export function recordArticleRead(id: string): void {
  if (readsSent.has(id)) return;
  readsSent.add(id);
  api.read(id).catch(() => readsSent.delete(id));
}

function clearDwell(element: Element): void {
  const timer = dwellTimers.get(element);
  if (timer) clearTimeout(timer);
  dwellTimers.delete(element);
}

function getObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = targets.get(entry.target);
        if (!id) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          if (dwellTimers.has(entry.target)) continue;
          const element = entry.target;
          dwellTimers.set(
            element,
            setTimeout(() => {
              dwellTimers.delete(element);
              if (document.visibilityState !== "visible") return;
              queueView(id);
              targets.delete(element);
              observer?.unobserve(element);
            }, DWELL_MS),
          );
        } else {
          clearDwell(entry.target);
        }
      }
    },
    { threshold: [0, VISIBLE_RATIO] },
  );
  return observer;
}

/** Tracks `ref` as a view of `articleId` while `enabled` (skip previews and the author's own stories). */
export function useViewTracking(ref: RefObject<Element | null>, articleId: string, enabled: boolean): void {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || sent.has(articleId) || typeof IntersectionObserver === "undefined") return;
    const io = getObserver();
    targets.set(element, articleId);
    io.observe(element);
    return () => {
      clearDwell(element);
      targets.delete(element);
      io.unobserve(element);
    };
  }, [ref, articleId, enabled]);
}
