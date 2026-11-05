import { Hono } from "hono";
import { lookupPincode } from "../lib/pincode.js";
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

  // GET /api/places/pincode/570017 → { valid, place: { state: "KA", district: "Mysuru", city: "Mysuru" } | null }
  // (owner 2026-11-05: the Press Pass form checks the PIN is real and fills state, district and town from it).
  app.get("/pincode/:pin", async (c) => {
    const result = await lookupPincode(c.req.param("pin"));
    c.header("Cache-Control", `public, max-age=${result.place?.city || !result.valid ? 86400 : 600}`);
    return c.json(result);
  });

  return app;
}
