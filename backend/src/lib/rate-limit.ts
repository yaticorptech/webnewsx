/**
 * Tiny in-memory fixed-window rate limiter (per process). Good enough for a single instance;
 * behind several instances each one enforces its own budget.
 */
export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, rule: RateLimitRule): RateLimitResult {
    const now = this.now();
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true, remaining: rule.limit - 1, retryAfterSec: 0 };
    }
    if (bucket.count >= rule.limit) {
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, remaining: rule.limit - bucket.count, retryAfterSec: 0 };
  }

  reset(): void {
    this.buckets.clear();
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000 && this.buckets.size < 50_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

/** SPEC §5.6 budgets. */
export const RATE_LIMITS = {
  usernameCheck: { limit: 30, windowMs: 60_000 },
  /** Instant search: one request per keystroke (debounced), so allow plenty. */
  search: { limit: 120, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 10 * 60_000 },
  social: { limit: 120, windowMs: 60_000 },
  views: { limit: 60, windowMs: 60_000 },
  /** Article page opens ("reads", Newsroom analytics) — one request per page open. */
  read: { limit: 60, windowMs: 60_000 },
  articleCreate: { limit: 30, windowMs: 60 * 60_000 },
  share: { limit: 60, windowMs: 60_000 },
  onboarding: { limit: 20, windowMs: 10 * 60_000 },
  flag: { limit: 20, windowMs: 10 * 60_000 },
  comment: { limit: 20, windowMs: 10 * 60_000 },
  pressPass: { limit: 30, windowMs: 60 * 60_000 },
  spotlightOrder: { limit: 20, windowMs: 60 * 60_000 },
  /** Chat messages and "Send to" (owner 2026-09-30). */
  message: { limit: 60, windowMs: 60_000 },
  /** New chats / groups / communities, and adding people to a group. */
  chatCreate: { limit: 60, windowMs: 60 * 60_000 },
  /** Community invitation calls (each up to CHAT_LIMITS.invitesPerCallMax people). */
  invite: { limit: 30, windowMs: 60 * 60_000 },
  /** Booking press meets (owner 2026-10-01). */
  pressMeetCreate: { limit: 20, windowMs: 60 * 60_000 },
  /**
   * New anonymous viewer ids (wn_vid) per client IP — bounds "drop the cookie, count again" to 30 extra views per story
   * per minute per address (generous because offices / campuses / carriers share addresses).
   */
  viewerMint: { limit: 300, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Anonymous "viewer" budgets apply per viewer id AND per client IP; the IP bucket is this many times larger
 * because several people can share one address (offices, campuses, mobile carriers).
 */
export const ANON_IP_FACTOR = 5;
