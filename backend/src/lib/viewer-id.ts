import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "../env.js";
import type { AppEnv } from "../types.js";
import { RATE_LIMITS, type RateLimiter } from "./rate-limit.js";

/**
 * Anonymous viewer ids (SPEC §5.4): an httpOnly `wn_vid` cookie `<uuid>.<HMAC-SHA256(BETTER_AUTH_SECRET)>`.
 * Only ids this server issued count as viewers — a client can't invent ids (or rotate made-up ones) to inflate
 * views, shares or reads. Dropping the cookie just gets a new id, and new ids per client IP are rate limited.
 */
export const VIEWER_COOKIE = "wn_vid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signature(id: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(`wn_vid:${id}`).digest("base64url");
}

export function signViewerId(id: string): string {
  return `${id}.${signature(id)}`;
}

/** The uuid inside a cookie value this server signed, or null for anything else (legacy unsigned ids included). */
export function verifyViewerId(value: string | null | undefined): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  if (!UUID.test(id)) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** The request's verified anonymous id (no signed-in check). */
export function anonViewerId(c: Context<AppEnv>): string | null {
  return verifyViewerId(getCookie(c, VIEWER_COOKIE));
}

/** `u:<userId>` / `a:<anon id>` of the request, or null for an anonymous visitor without a valid id yet. */
export function viewerKeyOf(c: Context<AppEnv>): string | null {
  const viewer = c.get("viewer");
  if (viewer) return `u:${viewer.id}`;
  const anon = anonViewerId(c);
  return anon ? `a:${anon}` : null;
}

/**
 * Like {@link viewerKeyOf}, but a first-time anonymous visitor is issued a signed id (Set-Cookie on this
 * response). Minting is limited per client IP; over the limit this returns null and the caller simply
 * doesn't count the request.
 */
export function ensureViewerKey(c: Context<AppEnv>, limiter: RateLimiter): string | null {
  const existing = viewerKeyOf(c);
  if (existing) return existing;
  if (!limiter.hit(`viewer-mint|ip:${c.get("clientIp")}`, RATE_LIMITS.viewerMint).allowed) return null;
  const id = randomUUID();
  setCookie(c, VIEWER_COOKIE, signViewerId(id), {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
  return `a:${id}`;
}
