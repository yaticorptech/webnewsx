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
export async function shareImage(id: string): Promise<Buffer | null> {
  if (!isUuid(id)) return null;
  const [row] = [
    ...(await db.execute<{ cover_key: string | null; cover_url: string | null }>(sql`
      select a.cover_key, a.cover_url from article a join "user" u on u.id = a.author_id
      where a.id = ${id} and a.status = 'published' and a.hidden_at is null and u.suspended_at is null
    `)),
  ];
  if (!row?.cover_key && !row?.cover_url) return null;

  let source: Buffer | null = null;
  if (storage instanceof LocalStorage && row.cover_key) {
    source = await storage.read(row.cover_key);
  } else if (row.cover_url?.startsWith("http")) {
    const response = await fetch(row.cover_url, { signal: AbortSignal.timeout(8000) });
    if (response.ok) source = Buffer.from(await response.arrayBuffer());
  }
  if (!source) return null;
  return sharp(source).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}
