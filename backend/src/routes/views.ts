import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { ensureViewerKey } from "../lib/viewer-id.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { recordViews } from "../queries/social.js";
import { viewsSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

export { VIEWER_COOKIE } from "../lib/viewer-id.js";

export function viewRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // POST /api/views { ids } — unique per viewer per article; anonymous viewers get a signed httpOnly wn_vid cookie.
  app.post("/", rateLimit(limiter, "views", RATE_LIMITS.views, "viewer"), async (c) => {
    const { ids } = await readJson(c, viewsSchema);
    const viewer = c.get("viewer");
    const viewerKey = ensureViewerKey(c, limiter);
    // Too many new anonymous ids from this address: accepted, but not counted.
    if (!viewerKey) return c.json({ counted: [] as string[] });
    const counted = await recordViews(ids, viewerKey, viewer?.id ?? null);
    return c.json({ counted });
  });

  return app;
}
