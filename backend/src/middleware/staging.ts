import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";
import type { AppEnv } from "../types.js";

/** Requests that may write on a read-only staging copy: signing in and out, and the demo engagement controls. */
const WRITABLE = [/^\/api\/auth\//, /^\/api\/admin\/demo$/];
/** Background counting the pages send on their own: accepted and ignored, so nothing errors and nothing is counted. */
const SILENT = [/^\/api\/views$/, /^\/api\/events$/, /^\/api\/articles\/[^/]+\/read$/];

/**
 * Staging sharing the live database (STAGING_READ_ONLY=1, owner 2026-11-02): reads work as on the live site; real data
 * — views, likes, shares, comments, stories, accounts — can't be changed from staging, so testing there never touches
 * genuine engagement or content.
 */
export const stagingReadOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!env.stagingReadOnly) return next();
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const path = c.req.path;
  if (WRITABLE.some((re) => re.test(path))) return next();
  if (SILENT.some((re) => re.test(path))) {
    return path === "/api/views" ? c.json({ counted: [] }) : path.endsWith("/read") ? c.json({ counted: false }) : c.body(null, 204);
  }
  return c.json({ error: { code: "staging_read_only", message: "This is the staging copy — changes are switched off here." } }, 403);
};
