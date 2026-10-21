import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * The client address from an `X-Forwarded-For` chain when `trustedHops` proxies we trust sit in front of us.
 * Each trusted proxy APPENDS the address it saw, so the client is the entry `trustedHops` positions from the
 * right; anything further left was written by the client and is ignored (a spoofed "X-Forwarded-For: 1.2.3.4"
 * only ever lands on the left). Returns null when there is no usable entry.
 */
export function clientIpFromForwardedFor(header: string | null | undefined, trustedHops: number): string | null {
  if (!header || trustedHops <= 0) return null;
  const entries = header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const candidate = entries[Math.max(0, entries.length - trustedHops)];
  return candidate && isIP(candidate) ? candidate : null;
}

/**
 * Client IP for rate limiting. With TRUST_PROXY=<n> the address comes from the right end of
 * `X-Forwarded-For` (see {@link clientIpFromForwardedFor}); otherwise — or when the header is missing or
 * malformed — the socket address from @hono/node-server. `X-Real-IP` is never trusted (any client can send it).
 */
export function resolveClientIp(c: Context, trustedHops: number): string {
  const forwarded = clientIpFromForwardedFor(c.req.header("x-forwarded-for"), trustedHops);
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // app.request() in tests has no socket.
    return "unknown";
  }
}
