import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  applyForPressPass,
  findPressPass,
  PRESS_PASS_OPTIONS,
  removePressDomain,
  setPressDomain,
  toPressPass,
  updatePressPass,
  verifyPressDomain,
} from "../queries/press-pass.js";
import { getViewerUser } from "../queries/users.js";
import { pressDomainSchema, pressPassApplySchema, pressPassUpdateSchema } from "../shared/contracts.js";
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

  // PUT /api/press-pass/domain — add / change your domain; returns the TXT record to publish.
  app.put("/domain", requireOnboarded, rateLimit(limiter, "press-pass", RATE_LIMITS.pressPass, "user"), async (c) => {
    const viewer = mustViewer(c);
    const { domain } = await readJson(c, pressDomainSchema);
    return c.json({ pressPass: toPressPass(await setPressDomain(viewer.id, domain), viewer) });
  });

  // POST /api/press-pass/domain/verify — checks DNS for the TXT record; 400 `domain_not_verified` until it's there.
  app.post("/domain/verify", requireOnboarded, rateLimit(limiter, "domain-verify", RATE_LIMITS.domainVerify, "user"), async (c) => {
    const viewer = mustViewer(c);
    return c.json({ pressPass: toPressPass(await verifyPressDomain(viewer.id), viewer) });
  });

  // DELETE /api/press-pass/domain — removes your domain (and its verification).
  app.delete("/domain", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    return c.json({ pressPass: toPressPass(await removePressDomain(viewer.id), viewer) });
  });

  return app;
}
