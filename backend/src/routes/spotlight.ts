import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireReporter } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { cancelOrder, createOrder, listPackages } from "../queries/spotlight.js";
import { spotlightOrderSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/** Spotlight (paid boost; payments later — every request waits for the Editor Desk). */
export function spotlightRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/spotlight/packages — active packages (public price list).
  app.get("/packages", async (c) => c.json({ items: await listPackages() }));

  // POST /api/spotlight/orders { articleId, packageId } → 201 pending (provider "manual") + message.
  app.post("/orders", requireReporter, rateLimit(limiter, "spotlight", RATE_LIMITS.spotlightOrder, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, spotlightOrderSchema);
    return c.json(await createOrder(viewer, input.articleId, input.packageId), 201);
  });

  // POST /api/spotlight/orders/:id/cancel — withdraw your pending request.
  app.post("/orders/:id/cancel", requireReporter, async (c) => {
    const viewer = mustViewer(c);
    return c.json({ order: await cancelOrder(viewer.id, c.req.param("id")) });
  });

  return app;
}
