"use client";

/*
 * DOM lookups for the guided tour (guided-tour.tsx): the tour never reaches into React state — it watches the page the
 * way the person sees it, so a step counts as done only when the real control really changed (aria-pressed, a sheet
 * open, the page's path…).
 */

/** Laid out and at least partly inside the viewport. */
export function onScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function fullyOnScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
}

/**
 * The first match that's on screen — one fully in view first, else one partly in view — or, failing that, the first
 * laid-out match off screen (the tour then shows which way to scroll). Hidden ones (display: none) never; null when none.
 */
export function firstOnScreen<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  const laidOut = [...root.querySelectorAll<T>(selector)].filter((el) => el.getClientRects().length > 0);
  const visible = laidOut.filter(onScreen);
  return visible.find(fullyOnScreen) ?? visible[0] ?? laidOut[0] ?? null;
}

/** The first match whose text contains `text` (case-insensitive). */
export function findByText<T extends Element = HTMLElement>(selector: string, text: string, root: ParentNode = document): T | null {
  const needle = text.toLowerCase();
  for (const el of root.querySelectorAll<T>(selector)) {
    if ((el.textContent ?? "").toLowerCase().includes(needle)) return el;
  }
  return null;
}

/** Every match whose visible text is exactly `text` (trimmed) — "Follow", not "Following". */
export function withExactText<T extends Element = HTMLElement>(selector: string, text: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(selector)].filter((el) => (el.textContent ?? "").trim() === text);
}

/** The feed item (`[data-feed-item]`: a reel, or a Home card) covering most of the viewport — the one being looked at. */
export function activeFeedItem(): HTMLElement | null {
  let best: { el: HTMLElement; ratio: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("[data-feed-item]")) {
    const rect = (el.querySelector(".reel") ?? el).getBoundingClientRect();
    if (rect.height === 0) continue;
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const ratio = visible / rect.height;
    if (ratio > 0 && ratio > (best?.ratio ?? 0)) best = { el, ratio };
  }
  return best?.el ?? null;
}

/** The dropdown menu that's open, if any. */
export const openMenu = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="menu"]');

/** The open dialog (sheet / popup) whose title starts with `title`; any open dialog when no title is given. */
export function openDialog(title?: string): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')) {
    if (!title) return dialog;
    const id = dialog.getAttribute("aria-labelledby");
    const heading = id ? document.getElementById(id) : dialog.querySelector("h1, h2, h3");
    if ((heading?.textContent ?? "").trim().startsWith(title)) return dialog;
  }
  return null;
}

/** The composer's stepper (nav "Publishing steps") is on step `number` ("01" | "02" | "03"). */
export function composerStepIs(number: string): boolean {
  const active = document.querySelector('nav[aria-label="Publishing steps"] [aria-current="step"]');
  return (active?.textContent ?? "").includes(number);
}
