import { adminMembershipRules, setMembershipRules } from "../queries/memberships.js";
import { getBehaviourOverview, getLiveVisitors, getPersonBehaviour } from "../queries/behaviour.js";
import { Hono } from "hono";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { parseWith, readJson } from "../lib/validate.js";
import { mustViewer, requireAdmin } from "../middleware/guards.js";
import { getAdminMemberships, recordPayout } from "../queries/membership-dashboards.js";
import { adminOverview, listAudit } from "../queries/admin-overview.js";
import {
  deleteAccount,
  getReporterRow,
  getUserRow,
  listReporters,
  listUsers,
  setUserRole,
  suspendUser,
  unsuspendUser,
  updateReporter,
} from "../queries/admin-people.js";
import {
  adminDeleteStory,
  approveReview,
  getAdminStory,
  hideStory,
  listAdminStories,
  listPins,
  listReviewQueue,
  pinStory,
  reorderPins,
  returnReview,
  unhideStory,
  unpinStory,
  unpublishStory,
} from "../queries/admin-stories.js";
import { listContactMessages, replyContactMessage } from "../queries/contact.js";
import { listFlagGroups, listStoryFlags, resolveFlags } from "../queries/flags.js";
import { listContentLog } from "../queries/content-log.js";
import { resolveTimeZone } from "../queries/newsroom.js";
import { adminPlatformFee, listDeskPressMeets, setPlatformFee } from "../queries/press-meet-booking.js";
import { clampLimit } from "../queries/shared.js";
import { adminGroupDetail, approveGroupApplication, deleteGroupByDesk, listGroupApplications, rejectGroupApplication } from "../queries/groups.js";
import { createPackage, declineOrder, deletePackage, grantOrder, listAdminOrders, listPackages, updatePackage } from "../queries/spotlight.js";
import {
  CATEGORY_VALUES,
  ROLE_VALUES,
  contactReplySchema,
  moderationReasonSchema,
  optionalReasonSchema,
  membershipPayoutSchema,
  platformFeeSchema,
  reorderPinsSchema,
  resolveFlagsSchema,
  reviewApproveSchema,
  reviewReturnSchema,
  setRoleSchema,
  spotlightDecisionSchema,
  spotlightPackageSchema,
  spotlightPackageUpdateSchema,
  suspendSchema,
  membershipRulesSchema,
  groupDecisionSchema,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

const blank = (v: unknown) => (v === "" ? undefined : v);
const optionalQuery = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());
const dateQuery = optionalQuery(z.iso.date().or(z.iso.datetime({ offset: true })).transform((v) => new Date(v)));

const storiesQuery = z.object({
  status: z.preprocess(blank, z.enum(["all", "published", "hidden", "in_review", "returned", "draft"]).default("all")),
  q: optionalQuery(z.string().trim().max(100)),
  reporter: optionalQuery(
    z
      .string()
      .trim()
      .max(31)
      .transform((v) => v.toLowerCase().replace(/^@/, "")),
  ),
  category: optionalQuery(z.enum(CATEGORY_VALUES)),
  from: dateQuery,
  to: dateQuery,
});
const usersQuery = z.object({
  q: optionalQuery(z.string().trim().max(100)),
  role: optionalQuery(z.enum(ROLE_VALUES)),
  status: optionalQuery(z.enum(["active", "suspended"])),
});
const reportersQuery = z.object({
  level: optionalQuery(z.enum(["trainee", "verified", "revoked"])),
  q: optionalQuery(z.string().trim().max(100)),
});
const inboxQuery = z.object({ status: z.preprocess(blank, z.enum(["new", "replied", "all"]).default("new")) });
const flagsQuery = z.object({ status: z.preprocess(blank, z.enum(["open", "resolved"]).default("open")) });
const ordersQuery = z.object({ status: z.preprocess(blank, z.enum(["pending", "active", "past", "all"]).default("pending")) });
const auditQuery = z.object({
  action: optionalQuery(z.string().trim().max(40)),
  target: optionalQuery(z.string().trim().max(128)),
});

/** Editor Desk console API (SPEC §3.11). Admin-only; every change is written to the audit log. */
export function adminRoutes() {
  const app = new Hono<AppEnv>();
  app.use("*", requireAdmin);
  const actorOf = (c: Parameters<typeof mustViewer>[0]) => ({ id: mustViewer(c).id });
  const limitOf = (raw: string | undefined, fallback = 20) => clampLimit(raw, fallback, 50);

  /* Overview */
  app.get("/overview", async (c) => c.json(await adminOverview(resolveTimeZone(c.req.query("tz")))));

  /* Group accounts (owner 2026-10-23): Press Pass holders' applications. */
  app.get("/groups", async (c) => c.json({ items: await listGroupApplications() }));
  app.get("/groups/:id/detail", async (c) => c.json(await adminGroupDetail(c.req.param("id"))));
  app.delete("/groups/:id/group", async (c) => {
    await deleteGroupByDesk(actorOf(c), c.req.param("id"));
    return c.json({ items: await listGroupApplications() });
  });
  for (const decision of ["approve", "reject"] as const) {
    app.post(`/groups/:id/${decision}`, async (c) => {
      const input = await readJson(c, groupDecisionSchema);
      const note = input.note?.trim() || null;
      if (decision === "approve") await approveGroupApplication(actorOf(c), c.req.param("id"), note);
      else await rejectGroupApplication(actorOf(c), c.req.param("id"), note);
      return c.json({ items: await listGroupApplications() });
    });
  }

  /* Review Desk */
  app.get("/review", async (c) => c.json(await listReviewQueue({ cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")) })));
  app.post("/review/:id/approve", async (c) => {
    const { note } = await readJson(c, reviewApproveSchema);
    return c.json(await approveReview(actorOf(c), c.req.param("id"), note));
  });
  app.post("/review/:id/return", async (c) => {
    const { note } = await readJson(c, reviewReturnSchema);
    return c.json({ story: await returnReview(actorOf(c), c.req.param("id"), note) });
  });

  /* Stories + Editor's Picks */
  app.get("/stories", async (c) => {
    const filters = parseWith(storiesQuery, c.req.query());
    return c.json(await listAdminStories({ ...filters, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")) }));
  });
  app.get("/stories/pins", async (c) => c.json({ items: await listPins() }));
  app.post("/stories/pins/reorder", async (c) => {
    const { ids } = await readJson(c, reorderPinsSchema);
    return c.json({ items: await reorderPins(actorOf(c), ids) });
  });
  app.get("/stories/:id", async (c) => {
    const story = await getAdminStory(c.req.param("id"));
    if (!story) throw notFound("Story not found");
    return c.json({ story, flags: await listStoryFlags(story.id) });
  });
  app.post("/stories/:id/hide", async (c) => {
    const { reason } = await readJson(c, moderationReasonSchema);
    return c.json({ story: await hideStory(actorOf(c), c.req.param("id"), reason) });
  });
  app.post("/stories/:id/unhide", async (c) => c.json({ story: await unhideStory(actorOf(c), c.req.param("id")) }));
  app.post("/stories/:id/unpublish", async (c) => {
    const { reason } = await readJson(c, optionalReasonSchema);
    return c.json({ story: await unpublishStory(actorOf(c), c.req.param("id"), reason) });
  });
  app.post("/stories/:id/pin", async (c) => c.json({ items: await pinStory(actorOf(c), c.req.param("id")) }));
  app.post("/stories/:id/unpin", async (c) => c.json({ items: await unpinStory(actorOf(c), c.req.param("id")) }));
  app.delete("/stories/:id", async (c) => {
    const reason = c.req.query("reason")?.trim().slice(0, 500) || null;
    await adminDeleteStory(actorOf(c), c.req.param("id"), reason);
    return c.body(null, 204);
  });

  /* Flags */
  app.get("/flags", async (c) => {
    const { status } = parseWith(flagsQuery, c.req.query());
    return c.json(await listFlagGroups({ status, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")) }));
  });
  app.post("/flags/:articleId/resolve", async (c) => {
    const input = await readJson(c, resolveFlagsSchema);
    return c.json(await resolveFlags(actorOf(c), c.req.param("articleId"), input));
  });

  /* Inbox: Contact us messages and the team's replies (owner 2026-10-10) */
  app.get("/inbox", async (c) => {
    const { status } = parseWith(inboxQuery, c.req.query());
    return c.json(await listContactMessages(status));
  });
  app.post("/inbox/:id/reply", async (c) => {
    const { reply } = await readJson(c, contactReplySchema);
    return c.json(await replyContactMessage(actorOf(c), c.req.param("id"), reply));
  });

  /* Reporters (Press Pass holders) */
  app.get("/reporters", async (c) => {
    const filters = parseWith(reportersQuery, c.req.query());
    return c.json(await listReporters({ ...filters, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")) }));
  });
  for (const action of ["verify", "downgrade", "revoke"] as const) {
    app.post(`/reporters/:userId/${action}`, async (c) => {
      const { reason } = await readJson(c, optionalReasonSchema);
      const userId = c.req.param("userId");
      await updateReporter(actorOf(c), userId, action, reason);
      return c.json({ reporter: await getReporterRow(userId) });
    });
  }

  /* People */
  app.get("/users", async (c) => {
    const filters = parseWith(usersQuery, c.req.query());
    return c.json(await listUsers({ ...filters, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")), viewerId: mustViewer(c).id }));
  });
  app.post("/users/:id/role", async (c) => {
    const { role } = await readJson(c, setRoleSchema);
    const id = c.req.param("id");
    await setUserRole(actorOf(c), id, role);
    return c.json({ user: await getUserRow(id, mustViewer(c).id) });
  });
  app.post("/users/:id/suspend", async (c) => {
    const { reason } = await readJson(c, suspendSchema);
    const id = c.req.param("id");
    await suspendUser(actorOf(c), id, reason);
    return c.json({ user: await getUserRow(id, mustViewer(c).id) });
  });
  app.post("/users/:id/unsuspend", async (c) => {
    const id = c.req.param("id");
    await unsuspendUser(actorOf(c), id);
    return c.json({ user: await getUserRow(id, mustViewer(c).id) });
  });
  // DELETE /api/admin/users/:id → `{ stories }` — the account and everything it owns, for good (owner 2026-10-01).
  app.delete("/users/:id", async (c) => c.json(await deleteAccount(actorOf(c), c.req.param("id"))));

  /* Spotlight */
  app.get("/spotlight/orders", async (c) => {
    const { status } = parseWith(ordersQuery, c.req.query());
    return c.json(await listAdminOrders({ status, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit")) }));
  });
  app.post("/spotlight/orders/:id/grant", async (c) => {
    const { note } = await readJson(c, spotlightDecisionSchema);
    return c.json({ order: await grantOrder(actorOf(c), c.req.param("id"), note) });
  });
  app.post("/spotlight/orders/:id/decline", async (c) => {
    const { note } = await readJson(c, spotlightDecisionSchema);
    return c.json({ order: await declineOrder(actorOf(c), c.req.param("id"), note) });
  });
  app.get("/spotlight/packages", async (c) => c.json({ items: await listPackages(true) }));
  app.post("/spotlight/packages", async (c) => {
    const input = await readJson(c, spotlightPackageSchema);
    return c.json({ package: await createPackage(actorOf(c), input) }, 201);
  });
  app.patch("/spotlight/packages/:id", async (c) => {
    const input = await readJson(c, spotlightPackageUpdateSchema);
    return c.json({ package: await updatePackage(actorOf(c), c.req.param("id"), input) });
  });
  app.delete("/spotlight/packages/:id", async (c) => {
    await deletePackage(actorOf(c), c.req.param("id"));
    return c.body(null, 204);
  });

  /* Press meets (owner 2026-10-05): the platform fee organizers pay to book, and every press meet with its report. */
  app.get("/press-meets/platform-fee", async (c) => c.json(await adminPlatformFee()));
  app.put("/press-meets/platform-fee", async (c) => {
    const { amountInr } = await readJson(c, platformFeeSchema);
    return c.json(await setPlatformFee(actorOf(c).id, amountInr));
  });
  app.get("/press-meets", async (c) => c.json(await listDeskPressMeets(c.req.query("cursor"))));

  /* Memberships (owner 2026-10-15): totals, what each reporter is owed, every payment, and recorded payouts. */
  app.get("/memberships", async (c) => c.json(await getAdminMemberships()));

  // GET /api/admin/behaviour?days=7|30|90 — Desk → Behaviour: every tap on the site, summed up (owner 2026-10-16).
  app.get("/behaviour", async (c) => {
    const days = [1, 7, 30, 90].includes(Number(c.req.query("days"))) ? Number(c.req.query("days")) : 7;
    return c.json(await getBehaviourOverview(days));
  });

  // GET / PUT /api/admin/membership-rules — who may start a premium membership (owner 2026-10-16), audited.
  app.get("/membership-rules", async (c) => c.json(await adminMembershipRules()));
  app.put("/membership-rules", async (c) => {
    const { rules } = await readJson(c, membershipRulesSchema);
    return c.json(await setMembershipRules(mustViewer(c).id, rules));
  });

  // GET /api/admin/live — who's on WebNEWS right now (owner 2026-10-16).
  app.get("/live", async (c) => c.json(await getLiveVisitors()));

  // GET /api/admin/behaviour/people/:username — one person's behaviour and timeline.
  app.get("/behaviour/people/:username", async (c) => c.json(await getPersonBehaviour(c.req.param("username"))));
  app.post("/memberships/payouts", async (c) => {
    const input = await readJson(c, membershipPayoutSchema);
    await recordPayout(input, actorOf(c).id);
    return c.json(await getAdminMemberships(), 201);
  });

  /* Audit log */
  // GET /api/admin/activity?cursor=&q= — Reporter activity (owner 2026-10-31): stories published / edited / deleted,
  // with the IP and browser each came from.
  app.get("/activity", async (c) => c.json(await listContentLog(c.req.query("cursor"), c.req.query("q")?.slice(0, 80))));

  app.get("/audit", async (c) => {
    const { action, target } = parseWith(auditQuery, c.req.query());
    return c.json(await listAudit({ action, targetId: target, cursor: c.req.query("cursor"), limit: limitOf(c.req.query("limit"), 30) }));
  });

  return app;
}
