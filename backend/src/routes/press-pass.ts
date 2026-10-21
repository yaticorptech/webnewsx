import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { applyForPressPass, findPressPass, PRESS_PASS_OPTIONS, toPressPass, updatePressPass } from "../queries/press-pass.js";
import { getViewerUser } from "../queries/users.js";
import { pressPassApplySchema, pressPassUpdateSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

export function pressPassRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/press-pass/options — reporter types, experience, languages, regions (Indian states, Karnataka districts), pledge.
  app.get("/options", (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(PRESS_PASS_OPTIONS);
  });

  // GET /api/press-pass — your pass (active or revoked) or null.
  app.get("/", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const pass = await findPressPass(viewer.id);
    return c.json({ pressPass: pass ? toPressPass(pass, viewer) : null });
  });

  // POST /api/press-pass — readers apply (3 steps in the UI); the pass is issued instantly as Trainee.
  app.post("/", requireOnboarded, rateLimit(limiter, "press-pass", RATE_LIMITS.pressPass, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, pressPassApplySchema);
    const pass = await applyForPressPass(viewer, input);
    return c.json({ pressPass: toPressPass(pass, viewer), viewer: await getViewerUser(viewer.id) }, 201);
  });

  // PATCH /api/press-pass — complete / update your active pass (verification, region, languages, about, links, pledge once).
  app.patch("/", requireOnboarded, rateLimit(limiter, "press-pass", RATE_LIMITS.pressPass, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, pressPassUpdateSchema);
    const pass = await updatePressPass(viewer, input);
    return c.json({ pressPass: toPressPass(pass, viewer) });
  });

  return app;
}
