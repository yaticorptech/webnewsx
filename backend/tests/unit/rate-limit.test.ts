import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/lib/rate-limit.js";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then blocks with retry-after", () => {
    let now = 1_000;
    const limiter = new RateLimiter(() => now);
    const rule = { limit: 2, windowMs: 10_000 };
    expect(limiter.hit("k", rule).allowed).toBe(true);
    expect(limiter.hit("k", rule).allowed).toBe(true);
    const blocked = limiter.hit("k", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(10);
    expect(limiter.hit("other", rule).allowed).toBe(true);
    now += 10_001;
    expect(limiter.hit("k", rule).allowed).toBe(true);
  });
});
