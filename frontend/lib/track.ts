"use client";

import { api } from "@/lib/api";
import { isNativeApp } from "@/lib/native-app";
import type { TrackEvent, TrackedFeature } from "@/lib/shared/contracts";

/*
 * Behaviour tracking (owner 2026-10-16: "every single button's data, saved with the profile"). Two kinds of events:
 *  - every tap on a button or link anywhere on the site (`click`, with what it said), recorded by one listener on the
 *    page (installTapTracking) — no button needs wiring by hand. `data-track="Name"` on an element names it explicitly;
 *  - named events for features worth counting on their own (TRACKED_FEATURES: auto-scroll, grid / reels, News radio,
 *    reading time…), sent with track().
 * Events are batched and sent every few seconds and when the page is hidden. The Editor Desk's pages are never tracked.
 */

const FLUSH_MS = 4_000;
const MAX_BATCH = 50;

let queue: TrackEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

const tracking = () => typeof window !== "undefined" && !window.location.pathname.startsWith("/admin");

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_MS);
}

function flush(keepalive = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length > 0) {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    // Analytics never gets in the reader's way: failures are dropped.
    api.events(isNativeApp() ? "app" : "web", batch, { keepalive }).catch(() => {});
  }
}

/** Records one event (named feature or a custom name). */
export function track(name: TrackedFeature | (string & {}), data: Omit<TrackEvent, "name" | "path"> = {}): void {
  if (!tracking()) return;
  installHooks();
  queue.push({ name, path: window.location.pathname, ...data });
  if (queue.length >= MAX_BATCH) flush();
  else schedule();
}

function installHooks(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

const CLICKABLE = 'button, a[href], [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [data-track]';
/**
 * A button's name without its counts: "Like · 12 likes" → "Like", "Comments 4" → "Comments" (owner 2026-10-16: the
 * count made one button show as several — "Like · likes" and "Like · like").
 */
const clean = (text: string) =>
  text
    .split(" · ")
    .filter((part, index) => index === 0 || !/\d/.test(part))
    .join(" · ")
    .replace(/\b\d+(?:[.,]\d+)?\s*[KkMm]?\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

/** What a tapped element is called, the story it was on and the profile it opens. */
function describe(element: Element): Omit<TrackEvent, "name" | "path"> {
  const explicit = element.getAttribute("data-track");
  const href = element instanceof HTMLAnchorElement ? new URL(element.href, window.location.href) : null;
  const sameSite = href && href.origin === window.location.origin;
  const story =
    element.closest("[data-feed-item]")?.getAttribute("data-feed-item") ?? element.closest("[data-article-id]")?.getAttribute("data-article-id") ?? undefined;
  let label = explicit ?? element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "";
  let targetUsername: string | undefined;
  if (!explicit && sameSite) {
    const path = href.pathname;
    // Story and profile links say what they open, not their headline / name.
    if (path.startsWith("/a/")) label = "Open story";
    else if (/^\/[a-z0-9._]{3,30}\/?$/i.test(path) && !label) {
      targetUsername = path.replace(/\//g, "");
      label = "Open profile";
    }
  }
  if (!label) label = (element as HTMLElement).innerText ?? element.textContent ?? "";
  if (!label && href) label = sameSite ? `Link ${href.pathname}` : `External link ${href.hostname}`;
  const pressed = element.getAttribute("aria-pressed") ?? element.getAttribute("aria-checked");
  const props: Record<string, string | boolean> = {};
  if (pressed === "true" || pressed === "false") props.on = pressed !== "true"; // the state it's switching to
  if (href && !sameSite) props.to = href.hostname;
  let name = clean(label) || element.tagName.toLowerCase();
  // A liked heart tapped again takes the like back.
  if (name === "Like" && pressed === "true") name = "Unlike";
  return {
    label: name,
    articleId: story && /^[0-9a-f-]{36}$/i.test(story) ? story : undefined,
    targetUsername,
    props: Object.keys(props).length > 0 ? props : undefined,
  };
}

/** One listener for the whole site: every tap on a button or link becomes a `click` event. */
export function installTapTracking(): () => void {
  const onClick = (event: MouseEvent) => {
    if (!tracking() || !(event.target instanceof Element)) return;
    const element = event.target.closest(CLICKABLE);
    if (!element || element.closest("[data-no-track]")) return;
    track("click", describe(element));
  };
  document.addEventListener("click", onClick, { capture: true, passive: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
}

/** Every few minutes while the page is on screen: "still here" (Desk → Live now; left out of every report). */
const HEARTBEAT_MS = 2 * 60_000;

/** Records each page opened (`page_view`) and keeps the reader counted as live while the page stays on screen. */
export function trackPageViews(_pathname: string): () => void {
  track("page_view");
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") track("heartbeat");
  }, HEARTBEAT_MS);
  return () => clearInterval(timer);
}
