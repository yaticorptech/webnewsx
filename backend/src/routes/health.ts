import { sql as rawSql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { cacheStatus } from "../lib/cache.js";
import type { AppEnv } from "../types.js";

export function healthRoutes() {
  const app = new Hono<AppEnv>();

  // GET /api/health — liveness + database check.
  app.get("/", async (c) => {
    try {
      await db.execute(rawSql`select 1`);
      return c.json({ ok: true, db: true, cache: cacheStatus() });
    } catch {
      return c.json({ ok: false, db: false }, 503);
    }
  });

  return app;
}
