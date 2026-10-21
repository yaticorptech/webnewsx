import "server-only";

import { notFound, redirect } from "next/navigation";
import { ADMIN_HOME } from "./admin-home";
import { getViewer } from "./server-api";
import { canPublish, isEditorDesk, publishesToReview, type ViewerUser } from "./shared/contracts";

/**
 * Server-side session gates for Server Components, layouts and route handlers.
 * They rely on `getViewer()` (GET /api/me, deduped per request).
 */

export { getViewer };

/** Role rules shared with the backend (SPEC §3.11) — client components import them from `@/lib/shared/contracts`. */
export { canPublish, isEditorDesk, publishesToReview };

/** A viewer who finished onboarding: username is guaranteed. */
export type OnboardedViewer = ViewerUser & { username: string; onboarded: true };

function loginUrl(returnTo?: string): string {
  return returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
}

/**
 * The viewer as the SITE sees them: an admin browses the site as a logged-out visitor ("Visit site", owner rule
 * 2026-09-25), so they count as nobody here. Site pages use this; the console and onboarding use `getViewer()`.
 */
export async function getSiteViewer(): Promise<ViewerUser | null> {
  const viewer = await getViewer();
  return viewer?.role === "admin" ? null : viewer;
}

/** Logged-in site viewer (an admin counts as a visitor) or redirect to /login (optionally with ?next=returnTo). */
async function requireSiteViewer(returnTo?: string): Promise<ViewerUser> {
  const viewer = await getSiteViewer();
  if (!viewer) redirect(loginUrl(returnTo));
  return viewer;
}

/** Logged-in viewer or redirect to /login (optionally with ?next=returnTo). */
export async function requireViewer(returnTo?: string): Promise<ViewerUser> {
  const viewer = await getViewer();
  if (!viewer) redirect(loginUrl(returnTo));
  return viewer;
}

/** Logged-in AND onboarded site viewer; otherwise → /login or /onboarding (site pages only: an admin → /login → the console). */
export async function requireOnboardedViewer(returnTo?: string): Promise<OnboardedViewer> {
  const viewer = await requireSiteViewer(returnTo);
  if (!viewer.onboarded || !viewer.username) redirect("/onboarding");
  return viewer as OnboardedViewer;
}

/**
 * Onboarding gate for the (main) route group: a logged-in user without a finished profile is
 * sent to /onboarding. Returns the viewer (or null when logged out) for convenience.
 */
export async function redirectIfNeedsOnboarding(): Promise<ViewerUser | null> {
  const viewer = await getViewer();
  if (viewer && (!viewer.onboarded || !viewer.username)) redirect("/onboarding");
  return viewer;
}

/** For /login and /signup: an already logged-in viewer goes home (an admin to the Editor Desk, anyone unfinished to onboarding). */
export async function redirectIfLoggedIn(next = "/"): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;
  if (!viewer.onboarded || !viewer.username) redirect("/onboarding");
  redirect(isEditorDesk(viewer) ? ADMIN_HOME : next);
}

/** An onboarded Reporter (active Press Pass) or Editor Desk account — may write stories. */
export type ReporterViewer = OnboardedViewer & { role: "reporter" | "admin" };
/** An onboarded Editor Desk account. */
export type AdminViewer = OnboardedViewer & { role: "admin" };

/**
 * For /publish, /publish/[id], /newsroom: an onboarded Reporter or Editor Desk account.
 * Logged out → /login?next=…, not onboarded → /onboarding, Readers → /press-pass (get your Press Pass first).
 */
export async function requireReporter(returnTo?: string): Promise<ReporterViewer> {
  const viewer = await requireOnboardedViewer(returnTo);
  if (!canPublish(viewer)) redirect("/press-pass");
  return viewer as ReporterViewer;
}

/**
 * For /admin/**: Editor Desk only. Everyone else (logged out included) gets the 404 page, so the console's
 * existence isn't advertised; an admin who hasn't finished onboarding is sent to /onboarding.
 * The backend enforces the same rule on every /api/admin call (403 `admin_only`).
 */
export async function requireAdmin(): Promise<AdminViewer> {
  const viewer = await getViewer();
  if (!viewer || !isEditorDesk(viewer)) notFound();
  if (!viewer.onboarded || !viewer.username) redirect("/onboarding");
  return viewer as AdminViewer;
}
