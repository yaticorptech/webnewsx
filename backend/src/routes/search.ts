import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { searchStories } from "../queries/articles.js";
import { searchUsers } from "../queries/users.js";
import { SEARCH_LIMITS, type SearchResults } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/** "@name" and stray spaces don't matter; very long queries are cut. */
export function normalizeSearchQuery(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().replace(/^@+/, "").slice(0, SEARCH_LIMITS.queryMax).trim();
}

export function searchRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/search?q= — the masthead's instant search: people (username / name) and public stories (headline, text).
  app.get("/", rateLimit(limiter, "search", RATE_LIMITS.search, "ip"), async (c) => {
    const query = normalizeSearchQuery(c.req.query("q"));
    if (!query) return c.json({ query, users: [], stories: [] } satisfies SearchResults);
    const viewerId = c.get("viewer")?.id ?? null;
    const [users, stories] = await Promise.all([
      searchUsers(query, viewerId, SEARCH_LIMITS.users),
      searchStories(query, viewerId, SEARCH_LIMITS.stories),
    ]);
    return c.json({ query, users, stories } satisfies SearchResults);
  });

  return app;
}
