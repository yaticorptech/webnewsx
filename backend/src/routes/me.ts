import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { groupMember, pressPass, session as sessionTable, user } from "../db/schema.js";
import { purgeAccount } from "../db/purge.js";
import { deleteCookie } from "hono/cookie";
import { ACT_AS_COOKIE } from "../lib/acting.js";
import { resolveAvatarImage } from "../lib/avatar.js";
import { listMemberGroups } from "../queries/groups.js";
import { ApiError, isUniqueViolation, notFound, validationError } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { deleteQuietly, storage } from "../lib/storage.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { clampLimit } from "../queries/shared.js";
import { listNotices, markNoticesRead } from "../queries/notices.js";
import { listNotifications, listReportedStories, markNotificationsRead } from "../queries/notifications.js";
import { createContactMessage } from "../queries/contact.js";
import { registerPushDevice, removePushDevice, setPushNotifications } from "../queries/push.js";
import { listSaved } from "../queries/social.js";
import { hasPasswordLogin } from "../lib/desk-sign-in.js";
import { membershipEligibility } from "../queries/memberships.js";
import { getViewerUser, isUsernameTaken } from "../queries/users.js";
import {
  USERNAME_MESSAGES,
  validateNewUsername,
  contactMessageSchema,
  membershipPriceSchema,
  pressMeetPriceSchema,
  pushDeviceSchema,
  pushSettingSchema,
  readNoticesSchema,
  readNotificationsSchema,
  updateMeSchema,
  type AccountSettings,
  type ViewerUser,
  SELF_DEACTIVATED_REASON,
  leaveAccountSchema,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

export const usernameTaken = () => new ApiError(409, "username_taken", USERNAME_MESSAGES.taken, { username: USERNAME_MESSAGES.taken });

/** Fresh `ViewerUser` (role, reporter level, Press Pass summary) for an account. */
export async function viewerUserOr404(id: string): Promise<ViewerUser> {
  const dto = await getViewerUser(id);
  if (!dto) throw notFound("Account not found");
  return dto;
}

/** Removes a replaced avatar file if it was one of this user's uploads. */
export async function cleanupOldAvatar(oldImage: string | null, newImage: string, userId: string): Promise<void> {
  if (!oldImage || oldImage === newImage) return;
  const key = storage.keyFromUrl(oldImage);
  if (key?.startsWith(`avatars/${userId}/`)) await deleteQuietly(key);
}

export function meRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/me — always 200. Includes role, reporterLevel, pressPass and suspended (SPEC §3.11).
  // Posting as a group (owner 2026-10-23): the group's account, `actingAs` naming the member really signed in; `groups`
  // are always the member's own (the account switcher).
  app.get("/", async (c) => {
    const viewer = c.get("viewer");
    if (!viewer) return c.json({ viewer: null });
    const [me, groups] = await Promise.all([getViewerUser(viewer.id), listMemberGroups(viewer.actor?.id ?? viewer.id)]);
    if (!me) return c.json({ viewer: null });
    const actingAs = viewer.actor ? { groupId: viewer.id, role: viewer.actor.role, member: { id: viewer.actor.id, username: viewer.actor.username, name: viewer.actor.name, image: viewer.actor.image } } : null;
    return c.json({ viewer: { ...me, actingAs, groups } });
  });

  // GET /api/me/account — the Settings page (owner 2026-10-01): email, password login or not, advertorial price.
  app.get("/account", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    const [row] = await db
      .select({
        pressMeetPrice: user.pressMeetPrice,
        membershipPrice: user.membershipPrice,
        pushNotifications: user.pushNotifications,
        phoneNumber: user.phoneNumber,
      })
      .from(user)
      .where(eq(user.id, viewer.id))
      .limit(1);
    const body: AccountSettings = {
      email: viewer.email,
      phoneNumber: row?.phoneNumber ?? null,
      hasPassword: await hasPasswordLogin(db, viewer.id),
      pressMeetPrice: row?.pressMeetPrice ?? null,
      canSetPressMeetPrice: viewer.role !== "reader",
      membershipPrice: row?.membershipPrice ?? null,
      membershipEligibility: viewer.role === "reader" ? null : await membershipEligibility(viewer.id),
      pushNotifications: row?.pushNotifications ?? true,
    };
    return c.json(body);
  });

  // POST /api/me/contact { message } — Contact us (owner 2026-10-02): saved with the account's email and username.
  app.post("/contact", requireOnboarded, rateLimit(limiter, "contact", { limit: 5, windowMs: 60 * 60_000 }, "user"), async (c) => {
    const { message } = await readJson(c, contactMessageSchema);
    await createContactMessage(mustViewer(c), message);
    return c.body(null, 204);
  });

  // PUT /api/me/push-notifications { enabled } → `{ pushNotifications }` — Settings → Notifications (owner 2026-10-02).
  app.put("/push-notifications", requireOnboarded, async (c) => {
    const { enabled } = await readJson(c, pushSettingSchema);
    return c.json({ pushNotifications: await setPushNotifications(mustViewer(c).id, enabled) });
  });

  // POST /api/me/push-devices { token, platform } — the app on this phone gets this account's pushes.
  app.post("/push-devices", requireOnboarded, async (c) => {
    const { token, platform } = await readJson(c, pushDeviceSchema);
    await registerPushDevice(mustViewer(c).id, token, platform);
    return c.body(null, 204);
  });

  // DELETE /api/me/push-devices { token, platform } — logging out on that phone.
  app.delete("/push-devices", requireOnboarded, async (c) => {
    const { token } = await readJson(c, pushDeviceSchema);
    await removePushDevice(mustViewer(c).id, token);
    return c.body(null, 204);
  });

  // PUT /api/me/press-meet-price { price | null } → `{ pressMeetPrice }` — reporters and the Editor Desk only.
  app.put("/press-meet-price", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    if (viewer.role === "reader") throw new ApiError(403, "forbidden", "Get your Press Pass to set an advertorial price");
    const { price } = await readJson(c, pressMeetPriceSchema);
    await db.execute(sql`update "user" set press_meet_price = ${price} where id = ${viewer.id}`);
    return c.json({ pressMeetPrice: price });
  });

  // PUT /api/me/membership-price { price | null } → `{ membershipPrice }` — premium membership (owner 2026-10-14).
  app.put("/membership-price", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    if (viewer.role === "reader") throw new ApiError(403, "forbidden", "Get your Press Pass to offer a membership");
    const { price } = await readJson(c, membershipPriceSchema);
    // Starting or changing a membership needs the rules met (owner 2026-10-16); turning it off is always allowed.
    if (price !== null) {
      const check = await membershipEligibility(viewer.id);
      if (!check.eligible) {
        throw new ApiError(
          403,
          "membership_not_eligible",
          `Premium membership opens once you meet every condition: ${check.rules
            .filter((rule) => !rule.done)
            .map((rule) => rule.title)
            .join(", ")}.`,
        );
      }
    }
    await db.update(user).set({ membershipPrice: price }).where(eq(user.id, viewer.id));
    return c.json({ membershipPrice: price });
  });

  // GET /api/me/saved?cursor=&limit= — "Saved" tab (your own profile only).
  app.get("/saved", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    return c.json(await listSaved({ userId: viewer.id, cursor: c.req.query("cursor"), limit: clampLimit(c.req.query("limit"), 12, 30) }));
  });

  // GET /api/me/notices — notices from the Editor Desk (warnings, hidden stories), newest first, with the unread count.
  app.get("/notices", requireOnboarded, async (c) => c.json(await listNotices(mustViewer(c).id)));

  // POST /api/me/notices/read { ids? } — mark notices read ("Got it"); all of them when `ids` is omitted.
  app.post("/notices/read", requireOnboarded, async (c) => {
    const input = await readJson(c, readNoticesSchema);
    return c.json({ unread: await markNoticesRead(mustViewer(c).id, input.ids) });
  });

  // GET /api/me/notifications ?cursor= — the bell: new stories from followed publishers, reports on your stories.
  app.get("/notifications", requireOnboarded, async (c) =>
    c.json(await listNotifications(mustViewer(c).id, c.req.query("cursor"), clampLimit(c.req.query("limit"), 20, 50))),
  );

  // POST /api/me/notifications/read { ids? } — mark read; all of them when `ids` is omitted.
  app.post("/notifications/read", requireOnboarded, async (c) => {
    const input = await readJson(c, readNotificationsSchema);
    return c.json({ unread: await markNotificationsRead(mustViewer(c).id, input.ids) });
  });

  // GET /api/me/reported-stories — your stories readers reported: reasons, notes, hidden / locked (never who).
  app.get("/reported-stories", requireOnboarded, async (c) => c.json(await listReportedStories(mustViewer(c).id)));

  // PATCH /api/me — edit profile (onboarded users).
  /*
   * Leaving WebNEWS (owner 2026-10-23), from Edit profile — always your own account (a group is deleted from Groups).
   * Type your @username to confirm. Deactivate hides you until you log in again; Delete removes everything for good.
   */
  const leaving = async (c: Parameters<typeof mustViewer>[0]) => {
    const viewer = mustViewer(c);
    if (viewer.actor) throw new ApiError(403, "switch_back_first", "Switch back to your own account first. A group is deleted from Group accounts.");
    if (viewer.role === "admin") throw new ApiError(403, "cannot_leave_desk", "Editor Desk accounts can't be closed here.");
    const { confirm } = await readJson(c, leaveAccountSchema);
    if (confirm.replace(/^@/, "").toLowerCase() !== (viewer.username ?? "").toLowerCase()) {
      throw validationError({ confirm: "Type your username exactly to confirm" });
    }
    return viewer;
  };

  app.post("/deactivate", requireOnboarded, async (c) => {
    const viewer = await leaving(c);
    await db.transaction(async (tx) => {
      await tx.update(user).set({ suspendedAt: new Date(), suspendReason: SELF_DEACTIVATED_REASON }).where(eq(user.id, viewer.id));
      await tx.delete(sessionTable).where(eq(sessionTable.userId, viewer.id));
    });
    deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/delete", requireOnboarded, async (c) => {
    const viewer = await leaving(c);
    const [owned] = await db
      .select({ id: groupMember.groupId })
      .from(groupMember)
      .where(and(eq(groupMember.userId, viewer.id), eq(groupMember.role, "owner")))
      .limit(1);
    if (owned) throw new ApiError(409, "owns_group", "You own a group account. Delete the group first (Group accounts), then your account.");
    await purgeAccount(viewer.id);
    deleteCookie(c, ACT_AS_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.patch("/", requireOnboarded, rateLimit(limiter, "profile", RATE_LIMITS.onboarding, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, updateMeSchema);
    const changes: Partial<typeof user.$inferInsert> = {};

    if (input.username !== undefined && input.username !== viewer.username) {
      // A new username follows the new pattern (owner 2026-10-15); keeping an older one is always fine.
      const pattern = validateNewUsername(input.username);
      if (!pattern.ok) throw validationError({ username: pattern.message }, pattern.message);
      if (await isUsernameTaken(input.username, viewer.id)) throw usernameTaken();
      changes.username = input.username;
    }
    if (input.name !== undefined) changes.name = input.name;
    if (input.bio !== undefined) changes.bio = input.bio;
    if (input.image !== undefined) changes.image = await resolveAvatarImage(input.image, viewer.id, viewer.image);
    if (input.languages !== undefined) changes.preferredLanguages = input.languages;

    if (Object.keys(changes).length === 0) return c.json({ user: await viewerUserOr404(viewer.id) });

    let updated;
    try {
      updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(user)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(user.id, viewer.id))
          .returning();
        // One list (owner 2026-10-05): a reporter's Press Pass languages (on their profile) follow.
        if (row && changes.preferredLanguages) {
          await tx.update(pressPass).set({ languages: changes.preferredLanguages, updatedAt: new Date() }).where(eq(pressPass.userId, viewer.id));
        }
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, "user_username_unique")) throw usernameTaken();
      throw error;
    }
    if (!updated) throw notFound("Account not found");
    if (changes.image) await cleanupOldAvatar(viewer.image, changes.image, viewer.id);
    return c.json({ user: await viewerUserOr404(updated.id) });
  });

  return app;
}
