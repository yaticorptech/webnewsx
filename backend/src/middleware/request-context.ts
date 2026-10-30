import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";
import { resolveClientIp } from "../lib/client-ip.js";
import { ApiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

/** Sets `c.var.clientIp` (TRUST_PROXY aware). */
export const clientIpMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("clientIp", resolveClientIp(c, env.TRUST_PROXY));
  await next();
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for our own JSON/multipart endpoints: a cross-site browser request carries an Origin
 * header that isn't FRONTEND_URL. Requests without Origin (server-to-server, curl) are allowed —
 * they can't ride on a victim's cookies. Better Auth does its own origin checks.
 */
/** A publisher site's admin (owner 2026-10-29) calls from its own domain with a Bearer token — no cookies, so no CSRF. */
const SITE_ADMIN_PATH = /^\/api\/sites\/d\/[^/]+\/admin(\/|$)/;

export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method) && !SITE_ADMIN_PATH.test(c.req.path)) {
    const origin = c.req.header("origin");
    if (origin && origin !== env.FRONTEND_URL && origin !== new URL(c.req.url).origin) {
      throw new ApiError(403, "forbidden_origin", "Cross-site request blocked");
    }
  }
  await next();
};
