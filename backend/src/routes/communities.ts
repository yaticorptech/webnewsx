import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  createCommunity,
  deleteCommunity,
  getCommunity,
  inviteToCommunity,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listCommunityMembers,
  listMyInvites,
  respondToInvite,
  setCommunityRole,
  updateCommunity,
} from "../queries/communities.js";
import { removeMember } from "../queries/messages.js";
import { clampLimit } from "../queries/shared.js";
import { addPeopleSchema, communityRoleSchema, createCommunitySchema, updateCommunitySchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/**
 * /api/communities (owner 2026-09-30): public communities anyone can browse and join, private ones by invitation.
 * A community's chat is `/api/messages/:id` (same id).
 */
export function communityRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  const createLimit = rateLimit(limiter, "chat-create", RATE_LIMITS.chatCreate, "user");
  const inviteLimit = rateLimit(limiter, "invite", RATE_LIMITS.invite, "user");

  // GET /api/communities?q=&mine=1 — public communities (biggest first), or the ones you're in.
  app.get("/", async (c) => {
    const viewerId = c.get("viewer")?.id ?? null;
    const mine = c.req.query("mine") === "1";
    return c.json({ items: await listCommunities(viewerId, { q: c.req.query("q"), mine, limit: clampLimit(c.req.query("limit"), 30, 50) }) });
  });

  // GET /api/communities/invites — your pending invitations (registered before /:id).
  app.get("/invites", requireOnboarded, async (c) => c.json({ items: await listMyInvites(mustViewer(c).id) }));

  // POST /api/communities/invites/:inviteId/accept | decline
  for (const answer of ["accept", "decline"] as const) {
    app.post(`/invites/:inviteId/${answer}`, requireOnboarded, async (c) =>
      c.json(await respondToInvite(c.req.param("inviteId"), mustViewer(c).id, answer === "accept")),
    );
  }

  // POST /api/communities { name, description?, visibility, image? } → 201 `{ id }`.
  app.post("/", requireOnboarded, createLimit, async (c) => {
    const input = await readJson(c, createCommunitySchema);
    return c.json({ id: await createCommunity(mustViewer(c).id, input) }, 201);
  });

  // GET /api/communities/:id — CommunityDetail (a private one: members and invitees only).
  app.get("/:id", async (c) => c.json(await getCommunity(c.req.param("id"), c.get("viewer")?.id ?? null)));

  // PATCH /api/communities/:id — owner / admins.
  app.patch("/:id", requireOnboarded, async (c) => {
    const viewerId = mustViewer(c).id;
    await updateCommunity(c.req.param("id"), viewerId, await readJson(c, updateCommunitySchema));
    return c.json(await getCommunity(c.req.param("id"), viewerId));
  });

  // DELETE /api/communities/:id — the owner.
  app.delete("/:id", requireOnboarded, async (c) => {
    await deleteCommunity(c.req.param("id"), mustViewer(c).id);
    return c.body(null, 204);
  });

  // POST /api/communities/:id/join · /leave
  app.post("/:id/join", requireOnboarded, async (c) => {
    const viewerId = mustViewer(c).id;
    await joinCommunity(c.req.param("id"), viewerId);
    return c.json(await getCommunity(c.req.param("id"), viewerId));
  });
  app.post("/:id/leave", requireOnboarded, async (c) => {
    const viewerId = mustViewer(c).id;
    await leaveCommunity(c.req.param("id"), viewerId);
    return c.json(await getCommunity(c.req.param("id"), viewerId).catch(() => null));
  });

  // GET /api/communities/:id/members?offset= — owner and admins first.
  app.get("/:id/members", async (c) => {
    const offset = Math.max(0, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0);
    return c.json(await listCommunityMembers(c.req.param("id"), c.get("viewer")?.id ?? null, offset, clampLimit(c.req.query("limit"), 50, 100)));
  });

  // POST /api/communities/:id/invites { usernames } — any member invites people → `{ invited }`.
  app.post("/:id/invites", requireOnboarded, inviteLimit, async (c) => {
    const { usernames } = await readJson(c, addPeopleSchema);
    return c.json({ invited: await inviteToCommunity(c.req.param("id"), mustViewer(c).id, usernames) });
  });

  // POST /api/communities/:id/members/:username/role { role } — the owner.
  app.post("/:id/members/:username/role", requireOnboarded, async (c) => {
    const { role } = await readJson(c, communityRoleSchema);
    await setCommunityRole(c.req.param("id"), mustViewer(c).id, c.req.param("username"), role);
    return c.json({ role });
  });

  // DELETE /api/communities/:id/members/:username — owner / admins remove someone.
  app.delete("/:id/members/:username", requireOnboarded, async (c) => {
    await removeMember(c.req.param("id"), mustViewer(c).id, c.req.param("username"));
    return c.body(null, 204);
  });

  return app;
}
