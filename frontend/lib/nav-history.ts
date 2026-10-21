"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Where the label-less back arrow goes (owner rule 2026-09-25: a ← on every page but Home and the Editor Desk
 * Overview): the previous page of THIS site, else the page's fallback (/ or /admin) — never out of the site.
 *
 * Browsers with the Navigation API (Chrome/Edge, Safari 26.2+, Firefox 147+) list exactly this site's contiguous
 * history entries, so the arrow jumps to the nearest earlier entry that is a different page (repeat entries such as
 * the page you logged in from, or `#anchor` jumps, are skipped). Other browsers fall back to an in-app depth kept in
 * each entry's history.state, so Back/Forward jumps and reloads restore the right value; any doubt means fallback.
 */

type NavEntry = { url: string | null; key: string; index: number };
type NavigationLike = {
  currentEntry: NavEntry | null;
  entries(): NavEntry[];
  traverseTo(key: string): { committed?: Promise<unknown>; finished?: Promise<unknown> };
};

function navigationApi(): NavigationLike | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return nav && typeof nav.entries === "function" && nav.currentEntry ? nav : null;
}

/** The page an entry shows (the #hash doesn't make it another page). */
function pageOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

/** Navigation API: the first entry of the nearest earlier page that isn't the current one (null = none). */
function previousPage(nav: NavigationLike): NavEntry | null {
  const current = nav.currentEntry;
  if (!current?.url) return null;
  const entries = nav.entries();
  const here = pageOf(current.url);
  let i = current.index - 1;
  while (i >= 0 && (!entries[i]?.url || pageOf(entries[i]!.url!) === here)) i--;
  if (i < 0) return null;
  const target = pageOf(entries[i]!.url!);
  // Several entries of that page in a row (e.g. an #anchor jump): land on the first, the one the app rendered.
  while (i > 0 && entries[i - 1]?.url && pageOf(entries[i - 1]!.url!) === target) i--;
  return entries[i] ?? null;
}

/* ─────────── Fallback: in-app depth stamped into history.state ─────────── */

const DEPTH_KEY = "__webnewsDepth";
let depth = 0;
let lastPath: string | null = null;
let lastLength = 0;

function stampedDepth(state: unknown): number | null {
  const value = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof value === "number" && value >= 0 ? value : null;
}

function stamp(value: number) {
  depth = value;
  try {
    window.history.replaceState({ ...(window.history.state ?? {}), [DEPTH_KEY]: value }, "");
  } catch {
    // Some embedded browsers refuse replaceState: the arrow then uses the fallback page.
  }
}

function onPopState(event: PopStateEvent) {
  depth = stampedDepth(event.state) ?? 0;
  lastPath = window.location.pathname;
  lastLength = window.history.length;
}

/** Mount once (AppProviders): keeps the fallback depth for browsers without the Navigation API. */
export function useNavigationDepth(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (navigationApi()) return;
    const length = window.history.length;
    if (lastPath === null) {
      lastPath = pathname;
      lastLength = length;
      window.addEventListener("popstate", onPopState);
      stamp(stampedDepth(window.history.state) ?? 0);
      return;
    }
    // Same path (React re-running effects in development, or a Back/Forward already handled above).
    if (pathname === lastPath) return;
    const pushed = length > lastLength;
    lastPath = pathname;
    lastLength = length;
    // A push adds a page; a replace (redirect, login → back to the story) keeps the depth.
    stamp(pushed ? depth + 1 : depth);
  }, [pathname]);
}

/** Goes to the previous page of this site, or to `fallback` when there is none. */
export function goBack(router: { back(): void; push(href: string): void }, fallback: string): void {
  const nav = navigationApi();
  if (nav) {
    const target = previousPage(nav);
    if (!target) {
      router.push(fallback);
      return;
    }
    const result = nav.traverseTo(target.key);
    result.committed?.catch(() => {});
    result.finished?.catch(() => {});
    return;
  }
  if (depth > 0) router.back();
  else router.push(fallback);
}
