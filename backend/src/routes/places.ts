import { Hono } from "hono";
import { searchPlaces } from "../lib/places.js";
import type { AppEnv } from "../types.js";

/** /api/places (owner 2026-10-05) — the City boxes' suggestions. Public: place names only. */
export function placeRoutes() {
  const app = new Hono<AppEnv>();

  // GET /api/places?q=ba&state=KA&district=Dakshina%20Kannada → { items } (names starting with q, towns first).
  app.get("/", (c) => {
    const items = searchPlaces({
      q: (c.req.query("q") ?? "").slice(0, 60),
      state: c.req.query("state")?.slice(0, 8) || undefined,
      district: c.req.query("district")?.slice(0, 60) || undefined,
    });
    c.header("Cache-Control", "public, max-age=86400");
    return c.json({ items });
  });

  return app;
}
