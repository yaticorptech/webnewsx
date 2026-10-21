import type { MiddlewareHandler } from "hono";
import { auth } from "../auth.js";
import { fromNativeApp, toBrowserSessionCookie } from "../lib/browser-session-cookie.js";
import { deskSessionOver } from "../lib/desk-sign-in.js";
import { toReporterLevel, toRole } from "../lib/roles.js";
import type { AppEnv, Viewer } from "../types.js";

/**
 * "Show me what the public sees": an Editor Desk account browsing the site from the console's "Visit site"
 * (owner rule 2026-09-25) sends this header on every site request, and is served exactly like a logged-out
 * visitor. It can only take access away (never grants any), so any client may send it.
 */
export const VIEW_AS_VISITOR_HEADER = "x-webnews-view-as";

/** Cheap pre-check so anonymous requests never hit the database for a session lookup. */
function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return Boolean(cookieHeader && cookieHeader.includes("session_token"));
}

/**
 * Resolves the Better Auth session into `c.var.viewer` (null when signed out).
 * Refreshed session cookies (Better Auth's sliding expiry) are forwarded on our response.
 * A suspended account is treated as signed out (its sessions are revoked on suspension anyway), and so is an
 * admin session older than DESK_SESSION_HOURS (lib/desk-sign-in.ts: the Desk needs a fresh email + password sign-in).
 * With `x-webnews-view-as: visitor` the session is ignored altogether.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("viewer", null);
  c.set("sessionId", null);
  const asVisitor = c.req.header(VIEW_AS_VISITOR_HEADER) === "visitor";
  if (!asVisitor && hasSessionCookie(c.req.header("cookie"))) {
    const { headers, response } = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    const deskOver = response?.user.role === "admin" && deskSessionOver(new Date(response.session.createdAt));
    if (response?.user && !response.user.suspendedAt && !deskOver) {
      const u = response.user;
      const onboardedAt = u.onboardedAt ? new Date(u.onboardedAt) : null;
      const viewer: Viewer = {
        id: u.id,
        email: u.email,
        name: u.name ?? "",
        image: u.image ?? null,
        username: u.username ?? null,
        bio: u.bio ?? null,
        onboardedAt,
        onboarded: Boolean(onboardedAt),
        role: toRole(u.role),
        reporterLevel: toReporterLevel(u.reporterLevel),
      };
      c.set("viewer", viewer);
      c.set("sessionId", response.session.id);
    }
    await next();
    const app = fromNativeApp(c.req.header("user-agent"));
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", app ? cookie : toBrowserSessionCookie(cookie), { append: true });
    return;
  }
  await next();
};
