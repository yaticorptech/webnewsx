"use client";

import { useEffect, type RefObject } from "react";
import { useAdminVisit } from "@/components/layout/admin-visit";
import { useViewer } from "@/components/providers/viewer-provider";

/*
 * Free stories for visitors (owner 2026-10-08). Someone who isn't logged in sees FREE_STORIES different stories — a
 * story page opened, or a reel watched for REEL_DWELL_MS in a reel list, all counted together — then the next new story
 * brings up the sign-up wall (read-wall.tsx). Closing it (X) shows that story and lets them see MORE_AFTER_CLOSE more;
 * the one after brings the wall back, and so on: 11th, 14th, 17th… Stories already seen never count again. Kept on
 * this device (localStorage), so it holds across reloads and tabs; logged-in readers never see it.
 */

export const FREE_STORIES = 10;
/** Closing the wall: this many more new stories before it comes back. */
const MORE_AFTER_CLOSE = 2;
const REEL_DWELL_MS = 1_000;
const REEL_VISIBLE_RATIO = 0.6;
/** The stories seen (ids, oldest first) — and how many may be seen before the wall. */
const SEEN_KEY = "webnews:free-stories";
const ALLOWED_KEY = "webnews:free-stories-allowed";
/** Plenty for "seen before?"; the oldest are dropped past this. */
const MAX_REMEMBERED = 500;
/**
 * Stories this visitor was shown blurred under "Sign in to read" in a feed (owner 2026-10-12: "what is the use of the
 * blur" if the story opens anyway). Opening one of them brings up the wall with no X: sign up or log in to read it.
 */
const LOCKED_KEY = "webnews:locked-stories";

function readLocked(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOCKED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** The stories a feed just showed blurred. */
export function markLockedStories(ids: string[]): void {
  if (ids.length === 0) return;
  const locked = readLocked();
  const next = [...locked.filter((id) => !ids.includes(id)), ...ids].slice(-MAX_REMEMBERED);
  try {
    localStorage.setItem(LOCKED_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: nothing is locked.
  }
}

function readSeen(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function readAllowed(): number {
  try {
    return Math.max(FREE_STORIES, Number(localStorage.getItem(ALLOWED_KEY)) || 0);
  } catch {
    return FREE_STORIES;
  }
}

function save(seen: string[], allowed?: number): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-MAX_REMEMBERED)));
    if (allowed !== undefined) localStorage.setItem(ALLOWED_KEY, String(allowed));
  } catch {
    // Storage blocked (private mode): the visitor simply keeps reading.
  }
}

/* ─────────── The wall's open state (the popup itself: read-wall.tsx) ─────────── */

let wallOpen = false;
/** Up on a story the visitor saw blurred: it can't be closed. */
let wallHard = false;
/** The story the wall came up on (counted once the visitor closes it), and its page. */
let pending: { id: string; path: string } | null = null;
const wallListeners = new Set<() => void>();

export function subscribeWall(listener: () => void): () => void {
  wallListeners.add(listener);
  return () => {
    wallListeners.delete(listener);
  };
}

export const isWallOpen = () => wallOpen;
export const isWallHard = () => wallHard;
/** The page the wall came up on (a page change away from it closes it). */
export const wallPath = () => pending?.path ?? null;

function setWall(open: boolean) {
  if (wallOpen === open) return;
  wallOpen = open;
  wallListeners.forEach((listener) => listener());
}

/** The visitor closed it (X, Esc, outside): that story shows and counts, and MORE_AFTER_CLOSE more are free. */
export function closeReadWall(): void {
  if (wallHard) return;
  if (pending) {
    const seen = readSeen();
    const next = seen.includes(pending.id) ? seen : [...seen, pending.id];
    save(next, Math.min(next.length, MAX_REMEMBERED) + MORE_AFTER_CLOSE);
  }
  pending = null;
  setWall(false);
}

/** Logged in, left the page, the shell gone: closed, nothing counted or granted. */
export function dismissReadWall(): void {
  pending = null;
  wallHard = false;
  setWall(false);
}

/** A story is being seen: it counts while the visitor has stories left; otherwise the wall comes up on it. */
function seeStory(id: string): void {
  if (wallOpen) {
    // Already up on this page; or it came up on a page the visitor has since left (Back): that one is dropped.
    if (pending?.path === window.location.pathname) return;
    dismissReadWall();
  }
  const seen = readSeen();
  if (seen.includes(id)) return;
  if (readLocked().includes(id)) {
    pending = { id, path: window.location.pathname };
    wallHard = true;
    setWall(true);
    return;
  }
  if (Math.min(seen.length, MAX_REMEMBERED) < readAllowed()) {
    save([...seen, id]);
    return;
  }
  pending = { id, path: window.location.pathname };
  setWall(true);
}

/* ─────────── Who and what counts ─────────── */

/**
 * The free-story limit is switched off at launch (owner 2026-10-30: "show all articles without login for now; after
 * some days we will lock that"): every story, reel and page is open to visitors — no wall, no blurred cards, no
 * page limit. Turn it back on with NEXT_PUBLIC_READ_WALL=1 on Vercel (then redeploy); nothing else changes.
 */
export const READ_WALL_ON = process.env.NEXT_PUBLIC_READ_WALL === "1";

/** A visitor the meter applies to: logged out, and not an admin browsing as a visitor (and the limit is on). */
export function useMetered(): boolean {
  const viewer = useViewer();
  const adminVisit = useAdminVisit();
  return READ_WALL_ON && viewer === null && !adminVisit;
}

/** A story page: opening it is seeing the story. */
export function useMeterStoryPage(id: string, enabled: boolean): void {
  const metered = useMetered();
  useEffect(() => {
    if (enabled && metered) seeStory(id);
  }, [id, enabled, metered]);
}

/** A reel: seeing it means it was mostly on screen for a moment. */
export function useMeterReel(ref: RefObject<HTMLElement | null>, id: string, enabled: boolean): void {
  const metered = useMetered();
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !metered || !el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.intersectionRatio >= REEL_VISIBLE_RATIO) {
          timer ??= setTimeout(() => {
            timer = null;
            seeStory(id);
          }, REEL_DWELL_MS);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, REEL_VISIBLE_RATIO] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref, id, enabled, metered]);
}
