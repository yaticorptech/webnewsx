/**
 * Public, build-time configuration (NEXT_PUBLIC_* values are inlined by Next.js).
 * Safe to import from both server and client code.
 */

/** Public origin of the web app, without a trailing slash. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Whether the backend has Google OAuth credentials (renders "Continue with Google"). */
export const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

/**
 * The backend's Google OAuth *web* client ID (public). The WebNEWS app's native account picker asks Google for an ID
 * token addressed to it, which the backend then verifies (lib/native-app.ts). Empty = no Google sign-in in the app.
 */
export const googleWebClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** SSE endpoint. Same-origin through the rewrite unless a direct URL is configured. */
export const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/api/stream";

export const SITE_NAME = "WebNEWS";
export const TAGLINE = "Pulse of People";
export const SITE_DESCRIPTION =
  "A live, endlessly scrolling feed of news stories published by the public. Read what's breaking, follow publishers, and get your Press Pass to report.";

/** The single (light) theme's page colour: <meta name="theme-color"> and the web manifest. */
export const THEME_COLOR = "#FFFFFF";

/**
 * Stories on /trending (SPEC §3.1: top stories of the last 24h; the rail card shows 5). Lives here, not in the
 * "use client" list component, because the server page needs the number too (a client module's exports are
 * references on the server, not values).
 */
export const TRENDING_PAGE_SIZE = 20;
