import { Hono } from "hono";
import { env } from "../env.js";
import { GIF_HOST_REGEX, type GifResult, type GifSearchResponse } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

const PAGE = 24;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; value: GifSearchResponse }>();

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyGif = { id: string; title?: string; images?: Record<string, GiphyImage | undefined> };
type GiphyResponse = { data?: GiphyGif[]; pagination?: { total_count?: number; count?: number; offset?: number } };

/** GIPHY's address without the tracking query (`?cid=…`), checked against the hosts comments accept. */
function clean(url: string | undefined): string | null {
  if (!url) return null;
  const bare = url.split("?")[0] ?? "";
  return GIF_HOST_REGEX.test(bare) ? bare : null;
}

function toResult(gif: GiphyGif): GifResult | null {
  // The comment shows a ~200px-tall rendition (light on data); the grid uses the smaller still-animated preview.
  const full = gif.images?.fixed_height ?? gif.images?.downsized;
  const small = gif.images?.fixed_width_small ?? gif.images?.fixed_height_small ?? full;
  const url = clean(full?.url);
  const preview = clean(small?.url);
  const width = Number(full?.width);
  const height = Number(full?.height);
  if (!url || !preview || !(width > 0) || !(height > 0)) return null;
  return { id: gif.id, preview, gif: { url, width: Math.min(width, 2000), height: Math.min(height, 2000), title: (gif.title ?? "").slice(0, 140) } };
}

/** /api/gifs (owner 2026-10-31) — the comment box's GIF picker, from GIPHY (the key stays on the server). */
export function gifRoutes() {
  const app = new Hono<AppEnv>();

  // GET /api/gifs?q=&offset= → trending when q is empty.
  app.get("/", async (c) => {
    if (!env.GIPHY_API_KEY) return c.json({ configured: false, items: [], nextOffset: null } satisfies GifSearchResponse);
    const q = (c.req.query("q") ?? "").trim().slice(0, 50);
    const offset = Math.min(Math.max(0, Number(c.req.query("offset")) || 0), 4999);
    const key = `${q.toLowerCase()}|${offset}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return c.json(hit.value);

    const params = new URLSearchParams({ api_key: env.GIPHY_API_KEY, limit: String(PAGE), offset: String(offset), rating: "pg-13", bundle: "messaging_non_clips" });
    if (q) params.set("q", q);
    const res = await fetch(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params.toString()}`, { signal: AbortSignal.timeout(8000) }).catch(
      () => null,
    );
    if (!res?.ok) return c.json({ configured: true, items: [], nextOffset: null } satisfies GifSearchResponse, 502);
    const body = (await res.json()) as GiphyResponse;
    const items = (body.data ?? []).map(toResult).filter((r): r is GifResult => r !== null);
    const total = body.pagination?.total_count ?? 0;
    const next = offset + (body.pagination?.count ?? body.data?.length ?? 0);
    const value: GifSearchResponse = { configured: true, items, nextOffset: (body.data?.length ?? 0) === PAGE && next < total ? next : null };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
    return c.json(value);
  });

  return app;
}
