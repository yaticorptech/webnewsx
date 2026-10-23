import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { env } from "../env.js";
import { ACT_AS_COOKIE } from "../lib/acting.js";
import { ApiError, notFound } from "../lib/errors.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  answerInvite,
  applyForGroup,
  canActAs,
  deleteGroup,
  setGroupDeactivated,
  groupDetail,
  inviteMember,
  myGroupsPage,
  removeMember,
  setMemberRole,
} from "../queries/groups.js";
import { groupApplicationSchema, groupInviteSchema, groupMemberRoleSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/*
 * /api/groups — group accounts (owner 2026-10-23; queries/groups.ts). Always acts as the PERSON signed in, also while
 * they're posting as a group (middleware/acting-guard.ts lets these through): managing groups is never the group's job.
 */

/** The member really signed in (not the group they may be posting as). */
const person = (c: Context<AppEnv>) => {
  const viewer = mustViewer(c);
  return { id: viewer.actor?.id ?? viewer.id };
};

const SWITCH_DAYS = 365;

export function groupRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", requireOnboarded);
  const writes = rateLimit(limiter, "groups", { limit: 60, windowMs: 10 * 60_000 }, "user");

  app.get("/", async (c) => c.json(await myGroupsPage(person(c).id)));

  app.post("/applications", rateLimit(limiter, "group-apply", { limit: 5, windowMs: 60 * 60_000 }, "user"), async (c) => {
    const input = await readJson(c, groupApplicationSchema);
    return c.json({ application: await applyForGroup(person(c), input) }, 201);
  });

  // Switch to "Posting as" a group / back to your own account (lib/acting.ts reads the cookie on every request).
  app.post("/switch-back", (c) => {
    deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/:id/switch", async (c) => {
    const groupId = c.req.param("id");
    if (!(await canActAs(person(c).id, groupId))) throw notFound("Group not found");
    setCookie(c, ACT_AS_COOKIE, groupId, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: env.secureCookies,
      maxAge: SWITCH_DAYS * 24 * 60 * 60,
    });
    return c.json({ ok: true });
  });

  app.get("/:id", async (c) => c.json(await groupDetail(person(c).id, c.req.param("id"))));
  // The owner deactivates / reactivates the group (owner 2026-10-23); posting as it ends while it's off.
  for (const action of ["deactivate", "reactivate"] as const) {
    app.post(`/:id/${action}`, writes, async (c) => {
      await setGroupDeactivated(person(c), c.req.param("id"), action === "deactivate");
      if (action === "deactivate") deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
      return c.json(await myGroupsPage(person(c).id));
    });
  }

  // The owner deletes the group for good (owner 2026-10-23); posting as it ends.
  app.delete("/:id", writes, async (c) => {
    await deleteGroup(person(c), c.req.param("id"));
    deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
    return c.json(await myGroupsPage(person(c).id));
  });

  app.post("/:id/members", writes, async (c) => {
    const input = await readJson(c, groupInviteSchema);
    await inviteMember(person(c), c.req.param("id"), input.username, input.role);
    return c.json(await groupDetail(person(c).id, c.req.param("id")), 201);
  });
  app.patch("/:id/members/:userId", writes, async (c) => {
    const input = await readJson(c, groupMemberRoleSchema);
    await setMemberRole(person(c), c.req.param("id"), c.req.param("userId"), input.role);
    return c.json(await groupDetail(person(c).id, c.req.param("id")));
  });
  app.delete("/:id/members/:userId", writes, async (c) => {
    const me = person(c);
    const groupId = c.req.param("id");
    const memberId = c.req.param("userId");
    await removeMember(me, groupId, memberId);
    // Leaving the group you're posting as: back to your own account.
    if (memberId === me.id) deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
    return memberId === me.id ? c.json({ ok: true }) : c.json(await groupDetail(me.id, groupId));
  });

  for (const answer of ["accept", "decline"] as const) {
    app.post(`/:id/invite/${answer}`, writes, async (c) => {
      await answerInvite(person(c), c.req.param("id"), answer === "accept");
      return c.json(await myGroupsPage(person(c).id));
    });
  }

  app.all("*", () => {
    throw new ApiError(404, "not_found", "Not found");
  });

  return app;
}
