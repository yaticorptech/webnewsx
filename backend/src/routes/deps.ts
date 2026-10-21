import type { RateLimiter } from "../lib/rate-limit.js";

/** Per-app dependencies shared by route modules (a fresh set per createApp() — handy for tests). */
export type RouteDeps = { limiter: RateLimiter };
