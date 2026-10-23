import { Hono } from "hono";
import { z } from "zod";
import { cached } from "../lib/cache.js";
import { unauthorized, validationError } from "../lib/errors.js";
import { decodeRankCursor } from "../lib/ranking.js";
import { parseWith } from "../lib/validate.js";
import { viewerKeyOf } from "../lib/viewer-id.js";
import { listCategoryFeed, listFeed, listLanguageFeed, listVisitorMix, readerLanguages, readShuffle } from "../queries/articles.js";
import { listForYou } from "../queries/foryou.js";
import { listHeadlines } from "../queries/headlines.js";
import { clampLimit } from "../queries/shared.js";
import { listTrending } from "../queries/trending.js";
import { CATEGORY_VALUES, DISTRICT_CATEGORY, FEED_TAB_VALUES, KARNATAKA_DISTRICTS, PRESS_LANGUAGE_VALUES } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

const FEED_PAGE_SIZE = 10;
/** Signed-out pages are the same for everyone, so they're served from the cache for a short while (lib/cache.ts). */
const PUBLIC_FEED_TTL = 20;
const HEADLINES_TTL = 30;
const TRENDING_TTL = 60;
const TRENDING_SIZE = 5;
const TRENDING_MAX = 20;
// Without `tab` the API stays chronological ("latest") for backward compatibility; the web app asks for "foryou" explicitly.
const tabSchema = z.enum(FEED_TAB_VALUES).default("latest");
const categorySchema = z.enum(CATEGORY_VALUES).optional();
/** `language=hi` or several: `language=hi,ta,kn`. */
const languagesSchema = z
  .string()
  .transform((value) => [...new Set(value.split(",").map((code) => code.trim()).filter(Boolean))])
  .pipe(z.array(z.enum(PRESS_LANGUAGE_VALUES)).min(1).max(PRESS_LANGUAGE_VALUES.length))
  .optional();

export function feedRoutes() {
  const app = new Hono<AppEnv>();

  // GET /api/feed?tab=foryou|latest|following&cursor=&limit= — Editor's Picks lead page 1 of For You and Latest.
  // GET /api/feed?category=<category>[&district=<Karnataka district>] — a category page, newest first (tab ignored).
  // `&shuffle=<seed>` (Latest and categories, owner 2026-10-05): a fresh mix, recent stories first; its next pages
  // come back as `s.` cursors.
  app.get("/", async (c) => {
    const viewer = c.get("viewer");
    const limit = clampLimit(c.req.query("limit"), FEED_PAGE_SIZE, 30);
    const cursor = c.req.query("cursor");
    const shuffle = readShuffle(cursor, c.req.query("shuffle"));
    // A signed-in reader's languages lead their shuffled feeds (owner 2026-10-05).
    if (shuffle) shuffle.preferred = await readerLanguages(viewer?.id ?? null);
    // GET /api/feed?language=<code>[,<code>…] — the news in those languages (owner 2026-10-05, the Languages menu).
    const languages = parseWith(languagesSchema, c.req.query("language") || undefined);
    if (languages) return c.json(await listLanguageFeed({ languages, viewerId: viewer?.id ?? null, cursor, limit, shuffle }));
    const category = parseWith(categorySchema, c.req.query("category") || undefined);
    if (category) {
      const district = c.req.query("district") || null;
      if (district && (category !== DISTRICT_CATEGORY || !KARNATAKA_DISTRICTS.includes(district))) {
        throw validationError({ district: "Unknown district" });
      }
      const load = () => listCategoryFeed({ category, district, viewerId: viewer?.id ?? null, cursor, limit, shuffle });
      if (viewer) return c.json(await load());
      // Signed out, a shuffled page is the day's mix (one seed all day): the same for everyone, so cached too.
      return c.json(await cached(`feed:cat:${category}:${district ?? ""}:${cursor ?? ""}:${limit}:${shuffle?.seed ?? ""}`, PUBLIC_FEED_TTL, load));
    }
    const tab = parseWith(tabSchema, c.req.query("tab") || undefined);
    if (tab === "following" && !viewer) throw unauthorized();
    if (tab === "foryou") {
      // Visitors (owner 2026-10-22: "old and latest articles mixed on top, then sign in to read more"): sent the day's
      // seed (frontend lib/shuffle.ts), Home is the visitor mix instead of the ranking — the newest stories taking
      // turns with older ones (queries/articles.ts listVisitorMix) — so the open cards aren't simply the newest. The
      // same for everyone that day, so cached; its next pages come back as `s.` cursors like any shuffled feed.
      if (!viewer && shuffle) {
        const load = () => listVisitorMix({ shuffle, limit });
        return c.json(await cached(`feed:visitor:${shuffle.seed}:${shuffle.offset}:${limit}`, PUBLIC_FEED_TTL, load));
      }
      const viewerKey = viewerKeyOf(c);
      return c.json(await listForYou({ viewerId: viewer?.id ?? null, viewerKey, cursor: decodeRankCursor(cursor), limit }));
    }
    const load = () => listFeed({ tab, viewerId: viewer?.id ?? null, cursor, limit, shuffle });
    if (viewer) return c.json(await load());
    return c.json(await cached(`feed:${tab}:${cursor ?? ""}:${limit}:${shuffle?.seed ?? ""}`, PUBLIC_FEED_TTL, load));
  });

  // GET /api/feed/headlines?limit= — ticker + Live Wire.
  app.get("/headlines", async (c) => {
    const limit = clampLimit(c.req.query("limit"), 8, 30);
    const items = await cached(`feed:headlines:${limit}`, HEADLINES_TTL, () => listHeadlines(limit));
    return c.json({ items });
  });

  // GET /api/feed/trending?limit=1..20 (default 5) — "Trending now" rail and the /trending page.
  app.get("/trending", async (c) => {
    const limit = clampLimit(c.req.query("limit"), TRENDING_SIZE, TRENDING_MAX);
    const items = await cached(`feed:trending:${limit}`, TRENDING_TTL, () => listTrending(limit));
    return c.json({ items });
  });

  return app;
}
