import { Hono } from "hono";
import { notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { activeWishes, addWishComment, createWish, deleteWish } from "../queries/wishes.js";
import { wishCommentSchema, wishSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/** /api/wishes (owner 2026-10-31): birthday wishes and invitations — any member posts, the Home feed scatters them. */
export function wishRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const viewer = c.get("viewer");
    return c.json({ items: await activeWishes(viewer ? { id: viewer.id, role: viewer.role } : null) });
  });

  app.post("/", requireOnboarded, rateLimit(limiter, "social", RATE_LIMITS.social, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, wishSchema);
    return c.json({ wish: await createWish({ id: viewer.id, role: viewer.role }, input) }, 201);
  });

  // POST /api/wishes/:id/comments { body } — one of the quick wishes (owner 2026-10-31).
  app.post("/:id/comments", requireOnboarded, rateLimit(limiter, "social", RATE_LIMITS.social, "user"), async (c) => {
    const viewer = mustViewer(c);
    const { body } = await readJson(c, wishCommentSchema);
    const result = await addWishComment({ id: viewer.id, role: viewer.role }, c.req.param("id"), body);
    if (!result) throw notFound("Wish not found");
    return c.json(result, 201);
  });

  app.delete("/:id", requireUser, async (c) => {
    const viewer = mustViewer(c);
    if (!(await deleteWish({ id: viewer.id, role: viewer.role }, c.req.param("id")))) throw notFound("Wish not found");
    return c.body(null, 204);
  });

  return app;
}
