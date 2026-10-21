import { Hono } from "hono";
import { z } from "zod";
import { activePaymentProvider } from "../lib/payments.js";
import { parseWith } from "../lib/validate.js";
import { mustViewer, requireReporter } from "../middleware/guards.js";
import { newsroomBestTimes, newsroomSeries, newsroomStories, newsroomSummary, resolveTimeZone } from "../queries/newsroom.js";
import { findPressPass, toPassSummary } from "../queries/press-pass.js";
import { getStoryInsights } from "../queries/behaviour.js";
import { notFound } from "../lib/errors.js";
import { clampLimit } from "../queries/shared.js";
import { listMyOrders, listPackages } from "../queries/spotlight.js";
import { NEWSROOM_RANGES, SPOTLIGHT_PENDING_MESSAGE, type NewsroomRange, type NewsroomSpotlight } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

const rangeSchema = z
  .preprocess((v) => (v === undefined || v === "" ? 7 : Number(v)), z.number())
  .refine((v): v is NewsroomRange => (NEWSROOM_RANGES as readonly number[]).includes(v), "range must be 7, 30 or 90")
  .transform((v) => v as NewsroomRange);

/** Reporter analytics (SPEC §3.11). Every route is limited to your own stories. */
export function newsroomRoutes() {
  const app = new Hono<AppEnv>();
  app.use("*", requireReporter);

  // GET /api/newsroom/summary?range=7|30|90 — KPI tiles with deltas vs the previous period.
  app.get("/summary", async (c) => {
    const viewer = mustViewer(c);
    const range = parseWith(rangeSchema, c.req.query("range"));
    const pass = await findPressPass(viewer.id);
    return c.json(await newsroomSummary(viewer.id, range, pass ? toPassSummary(pass) : null));
  });

  // GET /api/newsroom/series?range=&tz= — daily views, reads, likes, shares, follower growth.
  app.get("/series", async (c) => {
    const viewer = mustViewer(c);
    const range = parseWith(rangeSchema, c.req.query("range"));
    return c.json(await newsroomSeries(viewer.id, range, resolveTimeZone(c.req.query("tz"))));
  });

  // GET /api/newsroom/stories?cursor=&limit= — per-story table (incl. In review / Returned / Hidden / Spotlight).
  app.get("/stories", async (c) => {
    const viewer = mustViewer(c);
    return c.json(await newsroomStories(viewer.id, { cursor: c.req.query("cursor"), limit: clampLimit(c.req.query("limit"), 20, 50) }));
  });

  // GET /api/newsroom/stories/:id/insights — one story's insights, Meta Ads style (owner 2026-10-16).
  app.get("/stories/:id/insights", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Story not found");
    return c.json(await getStoryInsights(id, mustViewer(c).id));
  });

  // GET /api/newsroom/best-times?tz= — best hour / weekday to publish.
  app.get("/best-times", async (c) => {
    const viewer = mustViewer(c);
    return c.json(await newsroomBestTimes(viewer.id, resolveTimeZone(c.req.query("tz"))));
  });

  // GET /api/newsroom/spotlight — packages + your Spotlight history.
  app.get("/spotlight", async (c) => {
    const viewer = mustViewer(c);
    const [packages, orders] = await Promise.all([listPackages(), listMyOrders(viewer.id)]);
    const body: NewsroomSpotlight = { packages, orders, paymentsEnabled: activePaymentProvider().enabled, message: SPOTLIGHT_PENDING_MESSAGE };
    return c.json(body);
  });

  return app;
}
