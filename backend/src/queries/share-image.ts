import { sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/client.js";
import { LocalStorage, storage } from "../lib/storage.js";
import { isUuid } from "./shared.js";

/**
 * The story's cover as a plain JPEG for sharing (owner 2026-10-02: shares carry the cover image, on the website and in
 * the app). Covers are stored as WebP — which some apps (WhatsApp) take for a sticker — and in production they live on
 * R2, which the page can't fetch cross-origin; this hands them out same-origin, converted. Only stories the public can
 * see (published, not hidden, author not suspended). null = no such story or no cover.
 */
/** The public story's cover bytes (null = no such story or no cover). */
async function coverSource(id: string): Promise<Buffer | null> {
  if (!isUuid(id)) return null;
  const [row] = [
    ...(await db.execute<{ cover_key: string | null; cover_url: string | null }>(sql`
      select a.cover_key, a.cover_url from article a join "user" u on u.id = a.author_id
      where a.id = ${id} and a.status = 'published' and a.hidden_at is null and u.suspended_at is null
    `)),
  ];
  if (!row?.cover_key && !row?.cover_url) return null;
  if (storage instanceof LocalStorage && row.cover_key) return storage.read(row.cover_key);
  // On R2 the key gives the bucket's address even when the stored URL is the old relative /media/… one.
  const url = row.cover_key ? storage.urlFor(row.cover_key) : row.cover_url;
  if (!url?.startsWith("http")) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

export async function shareImage(id: string): Promise<Buffer | null> {
  const source = await coverSource(id);
  if (!source) return null;
  return sharp(source).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

const OG_W = 1200;
const OG_H = 630;
const ogCache = new Map<string, Buffer>();

/**
 * The link-preview picture (owner 2026-10-31: WhatsApp showed shared stories blurred): WhatsApp, Facebook and X want a
 * landscape ~1.91:1 JPEG under ~300 KB, and shrink a tall 9:16 poster to a tiny square thumbnail. So: 1200×630, the
 * whole poster sharp in the middle over a blurred, dimmed copy of itself filling the width.
 */
export async function ogImage(id: string, version = ""): Promise<Buffer | null> {
  // `version` (the cover's file name, from the page) makes a changed cover a new picture.
  const cacheKey = `${id}|${version}`;
  const cached = ogCache.get(cacheKey);
  if (cached) return cached;
  const source = await coverSource(id);
  if (!source) return null;
  const base = sharp(source).rotate();
  const meta = await base.metadata();
  const wide = (meta.width ?? 1) / (meta.height ?? 1) >= 1.5;
  let out: Buffer;
  if (wide) {
    out = await base.clone().resize(OG_W, OG_H, { fit: "cover" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  } else {
    const backdrop = await base.clone().resize(OG_W, OG_H, { fit: "cover" }).blur(28).modulate({ brightness: 0.7 }).toBuffer();
    const front = await base.clone().resize({ height: OG_H, width: OG_W, fit: "inside" }).toBuffer();
    out = await sharp(backdrop).composite([{ input: front, gravity: "center" }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }
  if (ogCache.size >= 200) ogCache.delete(ogCache.keys().next().value as string);
  ogCache.set(cacheKey, out);
  return out;
}
