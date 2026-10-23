import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_VALUES, DISTRICT_CATEGORY, districtFromSlug, normalizeUsername, RESERVED_USERNAMES, USERNAME_REGEX } from "@/lib/shared/contracts";

/**
 * Client-address headers only a proxy we trust may set. The API rate-limits by client IP (from
 * X-Forwarded-For), and Next passes these headers on untouched — to `/api/*` rewrites and to server
 * rendering — so a browser that sends its own "X-Forwarded-For: 1.2.3.4" could pick a fresh identity per
 * request. Unless an edge proxy in front of this app sets them (TRUST_PROXY=1, e.g. Vercel or a load
 * balancer), they are dropped here; server rendering then sees the real socket address and the API sees
 * this server's.
 */
const FORWARDING_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded"] as const;

function trustsUpstreamProxy(): boolean {
  const value = process.env.TRUST_PROXY;
  return value === "true" || Number(value) > 0;
}

/*
 * Real 404s for search engines (owner 2026-10-22, SEO before hosting). Pages stream behind a loading skeleton, so a
 * missing story or profile can only say "not found" after the 200 has gone out (it's marked noindex, but crawlers still
 * count it as a "soft 404"). For crawlers only — people get the branded page as before, at no extra cost — a story,
 * profile or section that doesn't exist is answered 404 up front.
 */
const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|linkedin|embedly|preview/i;
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
/** Top-level pages that aren't profiles. */
const TOP_LEVEL = new Set([
  "about", "communities", "contact", "explore", "language", "market", "membership", "messages", "newsroom", "newsy",
  "notifications", "press-meet", "press-pass", "privacy", "publish", "reels", "settings", "terms", "trending", "login",
  "signup", "forgot-password", "reset-password", "onboarding", "admin", "dev", "s", "a", "category", "api", "media",
]);
const FILE = /\.(txt|xml|png|jpe?g|webp|gif|svg|ico|apk|json|webmanifest|js|css|map|woff2?)$/i;

async function exists(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.status !== 404;
  } catch {
    return true; // the API is unreachable: let the page decide
  }
}

/** True when the crawler asked for a story / profile / section that isn't there. */
async function missingForCrawler(pathname: string): Promise<boolean> {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "a" && parts.length === 2) return !(await exists(`/api/articles/by-slug/${encodeURIComponent(parts[1]!)}`));
  if (parts[0] === "category") {
    if (parts.length < 2 || parts.length > 3) return parts.length > 3;
    if (!(CATEGORY_VALUES as readonly string[]).includes(parts[1]!)) return true;
    return parts.length === 3 && (parts[1] !== DISTRICT_CATEGORY || districtFromSlug(parts[2]!) === null);
  }
  if (parts.length !== 1 || TOP_LEVEL.has(parts[0]!) || FILE.test(parts[0]!)) return false;
  let username: string;
  try {
    username = normalizeUsername(decodeURIComponent(parts[0]!));
  } catch {
    return true;
  }
  if (RESERVED_USERNAMES.has(username)) return false;
  if (!USERNAME_REGEX.test(username)) return true;
  return !(await exists(`/api/users/${encodeURIComponent(username)}`));
}

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found · WebNEWS</title></head><body><h1>Not found</h1><p>This page doesn't exist on WebNEWS. <a href="/">Go to the latest news</a>.</p></body></html>`;

export async function proxy(request: NextRequest) {
  if (request.method === "GET" && CRAWLER.test(request.headers.get("user-agent") ?? "") && (await missingForCrawler(request.nextUrl.pathname))) {
    return new NextResponse(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  }
  if (trustsUpstreamProxy()) return NextResponse.next();
  const headers = new Headers(request.headers);
  for (const name of FORWARDING_HEADERS) headers.delete(name);
  return NextResponse.next({ request: { headers } });
}

const CRAWLER_HEADER = { type: "header" as const, key: "user-agent", value: ".*([Bb]ot|[Cc]rawl|[Ss]pider|Slurp|facebookexternalhit|WhatsApp|LinkedIn|[Ee]mbedly|[Pp]review).*" };

export const config = {
  matcher: [
    { source: "/:path*", has: [{ type: "header", key: "x-forwarded-for" }] },
    { source: "/:path*", has: [{ type: "header", key: "x-real-ip" }] },
    { source: "/:path*", has: [{ type: "header", key: "forwarded" }] },
    // Crawlers on stories, sections and profiles (the real-404 check above).
    { source: "/a/:slug", has: [CRAWLER_HEADER] },
    { source: "/category/:path*", has: [CRAWLER_HEADER] },
    { source: "/:username", has: [CRAWLER_HEADER] },
  ],
};
