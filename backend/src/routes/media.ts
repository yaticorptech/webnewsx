import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { notFound } from "../lib/errors.js";
import { IMMUTABLE_CACHE, KEY_PATTERN, LocalStorage, contentTypeForKey, storage } from "../lib/storage.js";
import type { AppEnv } from "../types.js";

type ByteRange = { start: number; end: number };

/**
 * One `Range: bytes=…` request (what browsers send for video/audio): null = whole file, "invalid" = 416.
 * Multi-range requests are answered with the whole file (allowed by RFC 9110).
 */
export function parseRange(header: string | undefined, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return header.includes(",") ? null : "invalid";
  const [, from, to] = match;
  if (!from && !to) return "invalid";
  if (!from) {
    // Suffix range: the last N bytes.
    const length = Math.min(Number(to), size);
    return length > 0 ? { start: size - length, end: size - 1 } : "invalid";
  }
  const start = Number(from);
  const end = to ? Math.min(Number(to), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : "invalid";
}

/**
 * GET /media/<key> — serves uploads for the local storage driver (dev). With R2 in use it sends the browser on to the
 * same key on R2 (owner 2026-10-30: uploads from before the switch were copied there at the same keys, and their saved
 * links still say /media/…). Streams from disk and honours byte ranges, which video players need (Safari won't play a
 * video without them).
 */
export function mediaRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/*", async (c) => {
    let key: string;
    try {
      key = decodeURIComponent(c.req.path.replace(/^\/media\//, ""));
    } catch {
      throw notFound();
    }
    if (!(storage instanceof LocalStorage)) {
      if (!KEY_PATTERN.test(key)) throw notFound();
      return c.redirect(storage.urlFor(key), 301);
    }
    // Only well-formed keys we create, and the resolved path must stay inside the upload dir.
    const path = KEY_PATTERN.test(key) ? storage.resolvePath(key) : null;
    if (!path) throw notFound();
    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) throw notFound();
      size = info.size;
    } catch {
      throw notFound();
    }

    const headers: Record<string, string> = {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": IMMUTABLE_CACHE,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
    };
    const range = parseRange(c.req.header("range"), size);
    if (range === "invalid") return c.body(null, 416, { ...headers, "Content-Range": `bytes */${size}` });
    if (size === 0) return c.body(null, 200, { ...headers, "Content-Length": "0" });

    const { start, end } = range ?? { start: 0, end: size - 1 };
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
    return c.body(stream, range ? 206 : 200, {
      ...headers,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
  });

  return app;
}
