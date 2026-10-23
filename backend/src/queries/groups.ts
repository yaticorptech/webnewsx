import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, follow, groupApplication, groupMember, notification, pressPass, user } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { resolveAvatarImage } from "../lib/avatar.js";
import { ApiError, forbidden, isUniqueViolation, notFound, validationError } from "../lib/errors.js";
import {
  GROUP_LIMITS,
  SELF_DEACTIVATED_REASON,
  type AdminGroupApplication,
  type AdminGroupDetail,
  type AuthorSummary,
  type GroupApplication,
  type GroupApplicationInput,
  type GroupDetailResponse,
  type GroupMembershipSummary,
  type GroupRole,
  type MyGroupsResponse,
  groupApplicationSchema,
} from "../shared/contracts.js";
import { pingBell } from "./messages.js";
import { purgeAccount } from "../db/purge.js";
import { findActivePass, newPassNumber } from "./press-pass.js";
import { isUsernameTaken } from "./users.js";

/*
 * Group accounts (owner 2026-10-23; shared/contracts.ts "Group accounts"). A Press Pass holder applies; the Editor
 * Desk approves — only then is the group's account made (a `user` row with account_type "group", no login, its own
 * Verified Press Pass) and the applicant becomes its owner. The owner invites members (editor / writer); they accept
 * on their Groups page and can then switch to "Posting as" the group (lib/acting.ts).
 */

const GROUP_EMAIL_DOMAIN = "group.webnews.local";

type Person = { id: string };

const toApplication = (row: typeof groupApplication.$inferSelect, groupUsername: string | null): GroupApplication => ({
  id: row.id,
  name: row.name,
  username: row.username,
  about: row.about,
  image: row.image,
  link: row.link,
  status: row.status,
  deskNote: row.deskNote,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
  groupUsername,
});

const author = (row: { id: string; username: string | null; name: string; image: string | null }): AuthorSummary => ({
  id: row.id,
  username: row.username ?? "",
  name: row.name,
  image: row.image,
});

/**
 * The groups `personId` is an active member of (the account switcher). `withDeactivated`: also the ones their owner
 * deactivated (the Groups page, where the owner reactivates them); never the ones the Editor Desk suspended.
 */
export async function listMemberGroups(personId: string, withDeactivated = false): Promise<GroupMembershipSummary[]> {
  const visible = withDeactivated
    ? or(isNull(user.suspendedAt), eq(user.suspendReason, SELF_DEACTIVATED_REASON))
    : isNull(user.suspendedAt);
  const rows = await db
    .select({ id: user.id, username: user.username, name: user.name, image: user.image, role: groupMember.role, suspendedAt: user.suspendedAt })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.groupId))
    .where(and(eq(groupMember.userId, personId), eq(groupMember.status, "active"), visible))
    .orderBy(asc(user.name));
  return rows.map((r) => ({ id: r.id, username: r.username ?? "", name: r.name, image: r.image, role: r.role, deactivated: Boolean(r.suspendedAt) }));
}

/**
 * The owner deactivates the group (owner 2026-10-23): hidden like a suspended account — profile, stories — and nobody
 * can post as it until the owner reactivates it from the Groups page.
 */
export async function setGroupDeactivated(person: Person, groupId: string, deactivated: boolean): Promise<void> {
  await mustRole(groupId, person.id, ["owner"]);
  const [row] = await db
    .update(user)
    .set(deactivated ? { suspendedAt: new Date(), suspendReason: SELF_DEACTIVATED_REASON } : { suspendedAt: null, suspendReason: null })
    .where(
      and(
        eq(user.id, groupId),
        deactivated ? isNull(user.suspendedAt) : eq(user.suspendReason, SELF_DEACTIVATED_REASON),
      ),
    )
    .returning({ id: user.id });
  if (!row) throw new ApiError(409, "group_state", deactivated ? "The group isn't active." : "Only a group you deactivated can be reactivated here.");
}

/** `personId`'s role in `groupId` (active members only), or null. */
async function roleIn(groupId: string, personId: string): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, personId), eq(groupMember.status, "active")))
    .limit(1);
  return row?.role ?? null;
}

async function mustRole(groupId: string, personId: string, allowed: GroupRole[]): Promise<GroupRole> {
  const role = await roleIn(groupId, personId);
  if (!role) throw notFound("Group not found");
  if (!allowed.includes(role)) throw forbidden("Only the group's owner can do that");
  return role;
}

/** Stories the group's writers sent to the editors (a writer sees only their own). */
async function pendingStories(groupId: string, onlyWriter: string | null) {
  const writer = sql`(select row_to_json(w) from (select ${user.id} as id, ${user.username} as username, ${user.name} as name, ${user.image} as image from ${user} where ${user.id} = ${article.postedById}) w)`;
  const rows = await db
    .select({ id: article.id, title: article.title, coverUrl: article.coverUrl, submittedAt: article.groupSubmittedAt, writer: writer.mapWith((v) => v as AuthorSummary | null) })
    .from(article)
    .where(
      and(
        eq(article.authorId, groupId),
        eq(article.status, "draft"),
        isNotNull(article.groupSubmittedAt),
        onlyWriter ? eq(article.postedById, onlyWriter) : undefined,
      ),
    )
    .orderBy(asc(article.groupSubmittedAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    coverUrl: r.coverUrl,
    submittedAt: (r.submittedAt as Date).toISOString(),
    writer: r.writer ? author(r.writer) : null,
  }));
}

/** `GET /api/groups` — the Groups page. */
export async function myGroupsPage(personId: string): Promise<MyGroupsResponse> {
  const groups = await listMemberGroups(personId, true);
  const ids = groups.map((g) => g.id);
  const [memberCounts, pendingCounts, inviteRows, applicationRows, pass] = await Promise.all([
    ids.length
      ? db
          .select({ id: groupMember.groupId, n: count() })
          .from(groupMember)
          .where(and(inArray(groupMember.groupId, ids), eq(groupMember.status, "active")))
          .groupBy(groupMember.groupId)
      : [],
    ids.length
      ? db
          .select({ id: article.authorId, n: count() })
          .from(article)
          .where(and(inArray(article.authorId, ids), eq(article.status, "draft"), isNotNull(article.groupSubmittedAt)))
          .groupBy(article.authorId)
      : [],
    db
      .select({ id: user.id, username: user.username, name: user.name, image: user.image, role: groupMember.role, invitedBy: groupMember.invitedBy })
      .from(groupMember)
      .innerJoin(user, eq(user.id, groupMember.groupId))
      .where(and(eq(groupMember.userId, personId), eq(groupMember.status, "invited"), isNull(user.suspendedAt)))
      .orderBy(desc(groupMember.invitedAt)),
    db
      .select({ app: groupApplication, groupUsername: user.username })
      .from(groupApplication)
      .leftJoin(user, eq(user.id, groupApplication.groupId))
      .where(eq(groupApplication.applicantId, personId))
      .orderBy(desc(groupApplication.createdAt))
      .limit(10),
    findActivePass(personId),
  ]);
  const inviters = inviteRows.map((r) => r.invitedBy).filter((v): v is string => Boolean(v));
  const inviterRows = inviters.length
    ? await db.select({ id: user.id, username: user.username, name: user.name, image: user.image }).from(user).where(inArray(user.id, inviters))
    : [];
  const byId = new Map(inviterRows.map((r) => [r.id, author(r)]));
  const memberCount = new Map(memberCounts.map((r) => [r.id, r.n]));
  const pendingCount = new Map(pendingCounts.map((r) => [r.id, r.n]));
  return {
    groups: groups.map((g) => ({
      ...g,
      memberCount: memberCount.get(g.id) ?? 0,
      // Writers only hear about their own submissions on the group's page; the badge is for the editors.
      pendingStories: g.role === "writer" ? 0 : (pendingCount.get(g.id) ?? 0),
    })),
    invites: inviteRows.map((r) => ({
      id: r.id,
      username: r.username ?? "",
      name: r.name,
      image: r.image,
      role: r.role,
      invitedBy: r.invitedBy ? (byId.get(r.invitedBy) ?? null) : null,
    })),
    applications: applicationRows.map((r) => toApplication(r.app, r.groupUsername)),
    canApply: Boolean(pass),
    ownsGroup: groups.some((g) => g.role === "owner"),
  };
}

/** `POST /api/groups/applications` — a Press Pass holder asks the Desk for a group account. */
export async function applyForGroup(person: Person, raw: GroupApplicationInput): Promise<GroupApplication> {
  const input = groupApplicationSchema.parse(raw);
  if (!(await findActivePass(person.id))) throw new ApiError(403, "press_pass_required", "Get your own Press Pass first — then apply for a group account.");
  const [pending] = await db
    .select({ id: groupApplication.id })
    .from(groupApplication)
    .where(and(eq(groupApplication.applicantId, person.id), eq(groupApplication.status, "pending")))
    .limit(1);
  if (pending) throw new ApiError(409, "application_pending", "You already have an application waiting for the Editor Desk.");
  if (await ownsAGroup(person.id)) throw oneGroupOnly();
  await assertUsernameFree(input.username);
  const image = await resolveAvatarImage(input.image, person.id, null);
  const [row] = await db
    .insert(groupApplication)
    .values({ applicantId: person.id, name: input.name, username: input.username, about: input.about, image, link: input.link ?? null })
    .returning();
  return toApplication(row!, null);
}

/** One group per person (owner 2026-10-23: "1 group for 1 account, not more"). */
const oneGroupOnly = () => new ApiError(409, "one_group_only", "You already have a group account. One account can start only one group.");

async function ownsAGroup(personId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groupMember.groupId })
    .from(groupMember)
    .where(and(eq(groupMember.userId, personId), eq(groupMember.role, "owner")))
    .limit(1);
  return Boolean(row);
}

/**
 * Deletes a group account for good (owner 2026-10-23): the account, its stories, members and Press Pass, the same way
 * an account is deleted (db/purge.ts). The members keep their own accounts.
 */
export async function deleteGroup(person: Person, groupId: string): Promise<void> {
  await mustRole(groupId, person.id, ["owner"]);
  await purgeAccount(groupId);
}

/** `DELETE /api/admin/groups/:applicationId/group` — the Editor Desk deletes an approved group. */
export async function deleteGroupByDesk(admin: Person, applicationId: string): Promise<void> {
  const [app] = await db.select().from(groupApplication).where(eq(groupApplication.id, applicationId)).limit(1);
  if (!app?.groupId) throw notFound("Group not found");
  const result = await purgeAccount(app.groupId);
  await writeAudit(db, { actorId: admin.id, action: "group.delete", targetType: "user", targetId: app.groupId, targetLabel: `@${app.username}`, meta: { stories: result.articles } });
}

/** A username free for a new group: no account has it and no other pending application asked for it. */
async function assertUsernameFree(username: string, exceptApplication?: string): Promise<void> {
  const taken = await isUsernameTaken(username, null);
  const [asked] = await db
    .select({ id: groupApplication.id })
    .from(groupApplication)
    .where(
      and(
        eq(groupApplication.username, username),
        eq(groupApplication.status, "pending"),
        exceptApplication ? ne(groupApplication.id, exceptApplication) : undefined,
      ),
    )
    .limit(1);
  if (taken || asked) throw validationError({ username: "That username is taken" });
}

/** `GET /api/groups/:id` — one group, for its members. */
export async function groupDetail(personId: string, groupId: string): Promise<GroupDetailResponse> {
  const role = await roleIn(groupId, personId);
  if (!role) throw notFound("Group not found");
  const [group] = await db.select().from(user).where(eq(user.id, groupId)).limit(1);
  if (!group) throw notFound("Group not found");
  const members = await db
    .select({ id: user.id, username: user.username, name: user.name, image: user.image, role: groupMember.role, status: groupMember.status, joinedAt: groupMember.joinedAt, invitedAt: groupMember.invitedAt })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(sql`case ${groupMember.role} when 'owner' then 0 when 'editor' then 1 else 2 end`, asc(user.name));
  return {
    group: { id: group.id, username: group.username ?? "", name: group.name, image: group.image, role, bio: group.bio },
    members: members.map((m) => ({
      user: author(m),
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      invitedAt: m.invitedAt.toISOString(),
    })),
    pendingStories: await pendingStories(groupId, role === "writer" ? personId : null),
  };
}

/** `POST /api/groups/:id/members` — the owner invites someone by @username. */
export async function inviteMember(owner: Person, groupId: string, username: string, role: "editor" | "writer"): Promise<void> {
  await mustRole(groupId, owner.id, ["owner"]);
  const [target] = await db
    .select({ id: user.id, accountType: user.accountType, onboardedAt: user.onboardedAt, suspendedAt: user.suspendedAt })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (!target || !target.onboardedAt || target.suspendedAt) throw validationError({ username: "No WebNEWS account has that username" });
  if (target.accountType === "group") throw validationError({ username: "That's a group account — invite a person" });
  if (target.id === owner.id) throw validationError({ username: "You're already in the group" });
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(groupMember).where(eq(groupMember.groupId, groupId));
  if (n >= GROUP_LIMITS.membersMax) throw new ApiError(409, "group_full", `A group can have up to ${GROUP_LIMITS.membersMax} members.`);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(groupMember).values({ groupId, userId: target.id, role, status: "invited", invitedBy: owner.id });
      // The bell (owner 2026-10-23): "VK Mangalore invited you to join as a Writer".
      await tx.insert(notification).values({ userId: target.id, type: "outlet_invite", actorId: groupId, note: role });
      await pingBell(tx, target.id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw validationError({ username: "They're already in the group (or invited)" });
    throw error;
  }
}

/** `POST /api/groups/:id/invite/accept | decline`. */
export async function answerInvite(person: Person, groupId: string, accept: boolean): Promise<void> {
  const [invite] = await db
    .select({ status: groupMember.status })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, person.id)))
    .limit(1);
  if (!invite || invite.status !== "invited") throw notFound("Invitation not found");
  if (!accept) {
    await db.delete(groupMember).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, person.id)));
    return;
  }
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(groupMember)
    .where(and(eq(groupMember.userId, person.id), eq(groupMember.status, "active")));
  if (n >= GROUP_LIMITS.groupsPerPersonMax) throw new ApiError(409, "too_many_groups", `You can be in up to ${GROUP_LIMITS.groupsPerPersonMax} groups.`);
  await db
    .update(groupMember)
    .set({ status: "active", joinedAt: new Date() })
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, person.id)));
}

/** `PATCH /api/groups/:id/members/:userId` — the owner changes an editor / writer's role. */
export async function setMemberRole(owner: Person, groupId: string, memberId: string, role: "editor" | "writer"): Promise<void> {
  await mustRole(groupId, owner.id, ["owner"]);
  const [row] = await db
    .update(groupMember)
    .set({ role })
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, memberId), ne(groupMember.role, "owner")))
    .returning({ userId: groupMember.userId });
  if (!row) throw notFound("Member not found");
}

/**
 * `DELETE /api/groups/:id/members/:userId` — the owner removes a member (or cancels an invitation), or a member leaves.
 * Their stories stay with the group. The owner can't leave (the group would have nobody to run it).
 */
export async function removeMember(person: Person, groupId: string, memberId: string): Promise<void> {
  if (memberId === person.id) {
    const role = await roleIn(groupId, person.id);
    if (!role) throw notFound("Group not found");
    if (role === "owner") throw new ApiError(409, "owner_cannot_leave", "The owner can't leave the group. Ask the Editor Desk to hand it over first.");
  } else {
    await mustRole(groupId, person.id, ["owner"]);
  }
  const [row] = await db
    .delete(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, memberId), ne(groupMember.role, "owner")))
    .returning({ userId: groupMember.userId });
  if (!row) throw notFound("Member not found");
}

/** May `personId` switch to `groupId` right now? */
export async function canActAs(personId: string, groupId: string): Promise<boolean> {
  return (await listMemberGroups(personId)).some((g) => g.id === groupId);
}

/* ─────────────── Editor Desk ─────────────── */

/** `GET /api/admin/groups` — pending applications first, then the latest decisions. */
export async function listGroupApplications(): Promise<AdminGroupApplication[]> {
  const rows = await db
    .select({
      app: groupApplication,
      applicant: { id: user.id, username: user.username, name: user.name, image: user.image },
      passNumber: pressPass.passNumber,
    })
    .from(groupApplication)
    .innerJoin(user, eq(user.id, groupApplication.applicantId))
    .leftJoin(pressPass, and(eq(pressPass.userId, user.id), isNull(pressPass.revokedAt)))
    .orderBy(sql`case ${groupApplication.status} when 'pending' then 0 else 1 end`, desc(groupApplication.createdAt))
    .limit(100);
  const groupIds = rows.map((r) => r.app.groupId).filter((v): v is string => Boolean(v));
  const groups = groupIds.length ? await db.select({ id: user.id, username: user.username }).from(user).where(inArray(user.id, groupIds)) : [];
  const usernames = new Map(groups.map((g) => [g.id, g.username]));
  return rows.map((r) => ({
    ...toApplication(r.app, r.app.groupId ? (usernames.get(r.app.groupId) ?? null) : null),
    applicant: { ...author(r.applicant), passNumber: r.passNumber },
  }));
}

/**
 * `POST /api/admin/groups/:id/approve` — makes the group's account: its profile from the application, a Verified Press
 * Pass of its own (it covers the members, owner 2026-10-23), the applicant as owner.
 */
export async function approveGroupApplication(admin: Person, id: string, note: string | null): Promise<void> {
  const [app] = await db.select().from(groupApplication).where(eq(groupApplication.id, id)).limit(1);
  if (!app) throw notFound("Application not found");
  if (app.status !== "pending") throw new ApiError(409, "already_decided", "This application was already decided.");
  if (await ownsAGroup(app.applicantId)) throw new ApiError(409, "one_group_only", "This person already owns a group account — one account can start only one group.");
  if (await isUsernameTaken(app.username, null)) {
    throw new ApiError(409, "username_taken", `@${app.username} was taken in the meantime. Turn the application down so they can apply with another username.`);
  }
  const applicantPass = await findActivePass(app.applicantId);
  const groupId = randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: groupId,
      name: app.name,
      email: `${groupId}@${GROUP_EMAIL_DOMAIN}`,
      emailVerified: true,
      image: app.image,
      username: app.username,
      bio: app.about,
      onboardedAt: now,
      role: "reporter",
      reporterLevel: "verified",
      accountType: "group",
      preferredLanguages: applicantPass?.languages ?? [],
    });
    await tx.insert(pressPass).values({
      userId: groupId,
      passNumber: newPassNumber(applicantPass?.state ?? null),
      reporterType: "staff",
      outlet: app.name,
      state: applicantPass?.state ?? null,
      district: applicantPass?.district ?? null,
      city: applicantPass?.city ?? null,
      languages: applicantPass?.languages ?? [],
      about: app.about,
      links: app.link ? [app.link] : [],
      level: "verified",
    });
    await tx.insert(groupMember).values({ groupId, userId: app.applicantId, role: "owner", status: "active", invitedBy: admin.id, joinedAt: now });
    await tx
      .update(groupApplication)
      .set({ status: "approved", deskNote: note, decidedBy: admin.id, decidedAt: now, groupId })
      .where(eq(groupApplication.id, id));
    await writeAudit(tx, { actorId: admin.id, action: "group.approve", targetType: "user", targetId: groupId, targetLabel: `@${app.username}` });
  });
}

/** `GET /api/admin/groups/:id/detail` — an approved group, for the Desk: owner, members, stories and who wrote them. */
export async function adminGroupDetail(applicationId: string): Promise<AdminGroupDetail> {
  const [app] = await db.select({ groupId: groupApplication.groupId }).from(groupApplication).where(eq(groupApplication.id, applicationId)).limit(1);
  if (!app?.groupId) throw notFound("Group not found");
  const groupId = app.groupId;
  const [row] = await db
    .select({ group: user, passNumber: pressPass.passNumber })
    .from(user)
    .leftJoin(pressPass, eq(pressPass.userId, user.id))
    .where(eq(user.id, groupId))
    .limit(1);
  if (!row) throw notFound("Group not found");
  const writer = { id: user.id, username: user.username, name: user.name, image: user.image };
  const [followers, counts, members, posted, recent] = await Promise.all([
    db.select({ n: count() }).from(follow).where(eq(follow.followingId, groupId)),
    db
      .select({
        published: sql<number>`count(*) filter (where ${article.status} = 'published')::int`,
        drafts: sql<number>`count(*) filter (where ${article.status} <> 'published' and ${article.groupSubmittedAt} is null)::int`,
        waiting: sql<number>`count(*) filter (where ${article.status} = 'draft' and ${article.groupSubmittedAt} is not null)::int`,
      })
      .from(article)
      .where(eq(article.authorId, groupId)),
    db
      .select({ ...writer, role: groupMember.role, status: groupMember.status, joinedAt: groupMember.joinedAt, invitedAt: groupMember.invitedAt })
      .from(groupMember)
      .innerJoin(user, eq(user.id, groupMember.userId))
      .where(eq(groupMember.groupId, groupId))
      .orderBy(sql`case ${groupMember.role} when 'owner' then 0 when 'editor' then 1 else 2 end`, asc(user.name)),
    db
      .select({ id: article.postedById, n: count() })
      .from(article)
      .where(and(eq(article.authorId, groupId), isNotNull(article.postedById)))
      .groupBy(article.postedById),
    db
      .select({ id: article.id, title: article.title, status: article.status, publishedAt: article.publishedAt, updatedAt: article.updatedAt, writer })
      .from(article)
      .leftJoin(user, eq(user.id, article.postedById))
      .where(eq(article.authorId, groupId))
      .orderBy(desc(article.updatedAt))
      .limit(20),
  ]);
  const postedBy = new Map(posted.map((p) => [p.id, p.n]));
  const g = row.group;
  return {
    group: { ...author(g), createdAt: g.createdAt.toISOString(), passNumber: row.passNumber, followers: followers[0]?.n ?? 0 },
    stories: counts[0] ?? { published: 0, drafts: 0, waiting: 0 },
    members: members.map((m) => ({
      user: author(m),
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      invitedAt: m.invitedAt.toISOString(),
      storiesPosted: postedBy.get(m.id) ?? 0,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      at: (r.publishedAt ?? r.updatedAt).toISOString(),
      writer: r.writer?.id ? author(r.writer as { id: string; username: string | null; name: string; image: string | null }) : null,
    })),
  };
}

/** `POST /api/admin/groups/:id/reject`. */
export async function rejectGroupApplication(admin: Person, id: string, note: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(groupApplication)
      .set({ status: "rejected", deskNote: note, decidedBy: admin.id, decidedAt: new Date() })
      .where(and(eq(groupApplication.id, id), eq(groupApplication.status, "pending")))
      .returning();
    if (!row) throw notFound("Application not found");
    await writeAudit(tx, { actorId: admin.id, action: "group.reject", targetType: "user", targetId: row.applicantId, targetLabel: `@${row.username}`, meta: { note } });
  });
}
