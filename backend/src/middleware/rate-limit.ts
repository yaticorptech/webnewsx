import type { Context, MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors.js";
import { ANON_IP_FACTOR, type RateLimitRule, type RateLimiter } from "../lib/rate-limit.js";
import { anonViewerId } from "../lib/viewer-id.js";
import type { AppEnv } from "../types.js";

export type RateLimitKey = "ip" | "user" | "viewer";

type Bucket = { subject: string; rule: RateLimitRule };

/**
 * Buckets a request must fit in: the client IP, the signed-in user, or — for "viewer" — the signed-in
 * user; an anonymous visitor is limited by their (server-signed) viewer id AND by their IP (with a
 * larger IP budget), so throwing the cookie away doesn't buy a fresh budget.
 */
export function rateLimitBuckets(c: Context<AppEnv>, by: RateLimitKey, rule: RateLimitRule): Bucket[] {
  const viewer = c.get("viewer");
  const ip = { subject: `ip:${c.get("clientIp")}`, rule };
  if (by === "ip") return [ip];
  if (viewer) return [{ subject: `u:${viewer.id}`, rule }];
  if (by === "user") return [ip];
  const ipBucket = { subject: ip.subject, rule: { ...rule, limit: rule.limit * ANON_IP_FACTOR } };
  const anon = anonViewerId(c);
  return anon ? [{ subject: `a:${anon}`, rule }, ipBucket] : [ipBucket];
}

export function rateLimit(limiter: RateLimiter, name: string, rule: RateLimitRule, by: RateLimitKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const bucket of rateLimitBuckets(c, by, rule)) {
      const result = limiter.hit(`${name}|${bucket.subject}`, bucket.rule);
      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfterSec));
        throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.");
      }
    }
    await next();
  };
}
