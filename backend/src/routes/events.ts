import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { ensureViewerKey } from "../lib/viewer-id.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { recordEvents } from "../queries/behaviour.js";
import { trackBatchSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/** Behaviour tracking (owner 2026-10-16): every tap on the site, batched by the page (frontend lib/track.ts). */
export function eventRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // POST /api/events { platform, events: [{ name, label?, articleId?, targetUsername?, path, props? }] } → 204
  app.post("/", rateLimit(limiter, "events", RATE_LIMITS.views, "viewer"), async (c) => {
    const { platform, events } = await readJson(c, trackBatchSchema);
    const viewer = c.get("viewer");
    // The Editor Desk browsing the site is never tracked.
    if (viewer?.role === "admin") return c.body(null, 204);
    const viewerKey = ensureViewerKey(c, limiter);
    // Where each tap came from (owner 2026-10-31: kept for legal requests).
    const from = { ip: c.get("clientIp") || null, userAgent: c.req.header("user-agent")?.slice(0, 500) ?? null };
    if (viewerKey) await recordEvents(viewerKey, viewer?.id ?? null, platform, events, from);
    return c.body(null, 204);
  });

  return app;
}
