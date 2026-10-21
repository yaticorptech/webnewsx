import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { communityInvite, conversation, conversationMember, notification, user } from "../db/schema.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { publishChatEvent } from "../lib/events.js";
import { normalizeUsername } from "../lib/username.js";
import type {
  ChatPerson,
  ChatRole,
  CommunityDetail,
  CommunityInvite,
  CommunitySummary,
  CommunityVisibility,
  CreateCommunityInput,
  InviteStatus,
  UpdateCommunityInput,
} from "../shared/contracts.js";
import {
  applyChatDetails,
  returned,
  findPeople,
  getMembership,
  leaveChat,
  personJson,
  pingBell,
  postSystemMessage,
  resolveChatImage,
  type ConversationRecord,
} from "./messages.js";
import { isUuid } from "./shared.js";

/*
 * Communities (owner 2026-09-30): a named space with its own chat. Anyone can join a public one; a private one only
 * with an invitation. Any member can invite people; the owner and admins edit it and remove members; the owner can
 * make admins and delete it. Invitations, joins and accepted invites all reach the bell.
 */

const isManager = (role: ChatRole | null) => role === "owner" || role === "admin";

type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  visibility: CommunityVisibility;
  memberCount: number;
  role: ChatRole | null;
  inviteId: string | null;
  createdAt: string;
};

/** Community rows with the viewer's role and pending invitation (`c` = conversation). */
function communitySelect(viewerId: string | null): SQL {
  return sql`
    select c.id, c.name, c.description, c.image, c.visibility, c.created_at as "createdAt",
      (select count(*)::int from conversation_member cm where cm.conversation_id = c.id) as "memberCount",
      ${viewerId ? sql`(select vm.role from conversation_member vm where vm.conversation_id = c.id and vm.user_id = ${viewerId})` : sql`null::text`} as role,
      ${
        viewerId
          ? sql`(select vi.id from community_invite vi where vi.conversation_id = c.id and vi.invitee_id = ${viewerId} and vi.status = 'pending' limit 1)`
          : sql`null::uuid`
      } as "inviteId"
    from conversation c
  `;
}

function toSummary(row: CommunityRow): CommunitySummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image: row.image,
    visibility: row.visibility,
    memberCount: row.memberCount,
    viewer: { role: row.role, inviteId: row.role ? null : row.inviteId },
  };
}

async function findCommunity(id: string, executor: Executor = db): Promise<ConversationRecord> {
  if (!isUuid(id)) throw notFound("Community not found");
  const [conv] = await executor.select().from(conversation).where(and(eq(conversation.id, id), eq(conversation.kind, "community"))).limit(1);
  if (!conv) throw notFound("Community not found");
  return conv;
}

/** A private community is only visible to its members and to people it invited. */
function assertVisible(row: CommunityRow): void {
  if (row.visibility === "private" && !row.role && !row.inviteId) throw notFound("Community not found");
}

export async function getCommunity(id: string, viewerId: string | null): Promise<CommunityDetail> {
  if (!isUuid(id)) throw notFound("Community not found");
  const [row] = [...(await db.execute<CommunityRow>(sql`${communitySelect(viewerId)} where c.id = ${id} and c.kind = 'community'`))];
  if (!row) throw notFound("Community not found");
  assertVisible(row);
  const people = [
    ...(await db.execute<{ person: ChatPerson; role: ChatRole }>(sql`
      select ${personJson("u")} as person, m.role
      from conversation_member m join "user" u on u.id = m.user_id
      where m.conversation_id = ${id}
      order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at desc
      limit 8
    `)),
  ];
  return {
    ...toSummary(row),
    owner: people.find((p) => p.role === "owner")?.person ?? null,
    preview: people.map((p) => p.person),
    createdAt: new Date(row.createdAt).toISOString(),
    can: {
      invite: row.role !== null,
      edit: isManager(row.role),
      remove: isManager(row.role),
      delete: row.role === "owner",
    },
  };
}

/** Public communities (name search), biggest first — plus the ones you're in, on `mine`. */
export async function listCommunities(viewerId: string | null, options: { q?: string; mine?: boolean; limit: number }): Promise<CommunitySummary[]> {
  const needle = (options.q ?? "").trim().toLowerCase();
  const search = needle ? sql`and lower(c.name) like ${`%${needle.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}` : sql``;
  const scope =
    options.mine && viewerId
      ? sql`and exists (select 1 from conversation_member mm where mm.conversation_id = c.id and mm.user_id = ${viewerId})`
      : sql`and c.visibility = 'public'`;
  const rows = await db.execute<CommunityRow>(sql`
    ${communitySelect(viewerId)}
    where c.kind = 'community' ${scope} ${search}
    order by ${options.mine ? sql`c.last_message_at desc` : sql`"memberCount" desc, c.last_message_at desc`}, c.id
    limit ${options.limit}
  `);
  return [...rows].map(toSummary);
}

export async function createCommunity(ownerId: string, input: CreateCommunityInput): Promise<string> {
  return db.transaction(async (tx) => {
    const conv = returned(await tx
      .insert(conversation)
      .values({
        kind: "community",
        name: input.name,
        description: input.description || null,
        visibility: input.visibility ?? "public",
        image: resolveChatImage(input.image, ownerId, null) ?? null,
        createdBy: ownerId,
      })
      .returning());
    await tx.insert(conversationMember).values({ conversationId: conv.id, userId: ownerId, role: "owner", status: "active" });
    await postSystemMessage(tx, conv.id, ownerId, "created");
    return conv.id;
  });
}

export async function updateCommunity(id: string, viewerId: string, input: UpdateCommunityInput): Promise<void> {
  await db.transaction(async (tx) => {
    const conv = await findCommunity(id, tx);
    const membership = await getMembership(id, viewerId, tx);
    if (!membership || !isManager(membership.member.role)) throw forbidden("Only the community's admins can edit it");
    await applyChatDetails(tx, conv, viewerId, {
      name: input.name,
      image: input.image,
      description: input.description === undefined ? undefined : input.description || null,
      visibility: input.visibility,
    });
  });
}

export async function deleteCommunity(id: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await findCommunity(id, tx);
    const membership = await getMembership(id, viewerId, tx);
    if (membership?.member.role !== "owner") throw forbidden("Only the owner can delete a community");
    // Queued before the rows go: every member's tabs drop the chat.
    await publishChatEvent(tx, id, "update");
    await tx.delete(conversation).where(eq(conversation.id, id));
  });
}

/** Tells the owner (and the inviter, when someone else) that `userId` joined. */
async function notifyJoined(executor: Executor, conv: ConversationRecord, userId: string, inviterId: string | null): Promise<void> {
  const [owner] = await executor
    .select({ userId: conversationMember.userId })
    .from(conversationMember)
    .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.role, "owner")))
    .limit(1);
  const recipients = new Set([owner?.userId, inviterId].filter((id): id is string => Boolean(id) && id !== userId));
  for (const recipient of recipients) {
    await executor.insert(notification).values({ userId: recipient, type: "community_joined", actorId: userId, conversationId: conv.id });
    await pingBell(executor, recipient);
  }
}

async function addMember(executor: Executor, conv: ConversationRecord, userId: string, inviterId: string | null): Promise<void> {
  const inserted = await executor
    .insert(conversationMember)
    .values({ conversationId: conv.id, userId, role: "member", status: "active" })
    .onConflictDoNothing()
    .returning({ userId: conversationMember.userId });
  if (inserted.length === 0) return;
  await postSystemMessage(executor, conv.id, userId, "joined");
  await notifyJoined(executor, conv, userId, inviterId);
  await publishChatEvent(executor, conv.id, "update");
}

/** Joins a public community — or a private one you were invited to (that accepts the invitation). */
export async function joinCommunity(id: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const conv = await findCommunity(id, tx);
    if (await getMembership(id, viewerId, tx)) return;
    const [invite] = await tx
      .select()
      .from(communityInvite)
      .where(and(eq(communityInvite.conversationId, id), eq(communityInvite.inviteeId, viewerId), eq(communityInvite.status, "pending")))
      .limit(1);
    if (conv.visibility === "private" && !invite) throw notFound("Community not found");
    if (invite) {
      await tx.update(communityInvite).set({ status: "accepted", respondedAt: new Date() }).where(eq(communityInvite.id, invite.id));
    }
    await addMember(tx, conv, viewerId, invite?.inviterId ?? null);
  });
}

export async function leaveCommunity(id: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const conv = await findCommunity(id, tx);
    const membership = await getMembership(id, viewerId, tx);
    if (!membership) return;
    if (membership.member.role === "owner") {
      throw new ApiError(409, "owner_cannot_leave", "You own this community — delete it instead, or make someone else the owner first");
    }
    await leaveChat(tx, conv, membership.member);
  });
}

/** Invites people (any member may). Members and people with a pending invitation are skipped. Returns how many were invited. */
export async function inviteToCommunity(id: string, viewerId: string, usernames: string[]): Promise<number> {
  return db.transaction(async (tx) => {
    const conv = await findCommunity(id, tx);
    const membership = await getMembership(id, viewerId, tx);
    if (!membership) throw forbidden("Join the community to invite people");
    const people = await findPeople(usernames, viewerId, tx);
    let invited = 0;
    for (const person of people) {
      if (await getMembership(id, person.id, tx)) continue;
      const [invite] = await tx
        .insert(communityInvite)
        .values({ conversationId: conv.id, inviterId: viewerId, inviteeId: person.id })
        .onConflictDoNothing()
        .returning({ id: communityInvite.id });
      if (!invite) continue;
      await tx.insert(notification).values({
        userId: person.id,
        type: "community_invite",
        actorId: viewerId,
        conversationId: conv.id,
        inviteId: invite.id,
      });
      await pingBell(tx, person.id);
      invited += 1;
    }
    return invited;
  });
}

/** Accepts or declines an invitation addressed to the viewer. */
export async function respondToInvite(inviteId: string, viewerId: string, accept: boolean): Promise<{ status: InviteStatus; communityId: string }> {
  if (!isUuid(inviteId)) throw notFound("Invitation not found");
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(communityInvite)
      .where(and(eq(communityInvite.id, inviteId), eq(communityInvite.inviteeId, viewerId)))
      .for("update")
      .limit(1);
    if (!invite) throw notFound("Invitation not found");
    if (invite.status !== "pending") return { status: invite.status, communityId: invite.conversationId };
    const status: InviteStatus = accept ? "accepted" : "declined";
    await tx.update(communityInvite).set({ status, respondedAt: new Date() }).where(eq(communityInvite.id, invite.id));
    // The bell row now shows the answer.
    await tx.update(notification).set({ readAt: new Date() }).where(and(eq(notification.inviteId, invite.id), sql`${notification.readAt} is null`));
    await pingBell(tx, viewerId);
    if (accept) {
      const conv = await findCommunity(invite.conversationId, tx);
      await addMember(tx, conv, viewerId, invite.inviterId);
    }
    return { status, communityId: invite.conversationId };
  });
}

/** The viewer's pending invitations, newest first. */
export async function listMyInvites(viewerId: string): Promise<CommunityInvite[]> {
  const rows = await db.execute<CommunityRow & { inviteRowId: string; inviter: ChatPerson | null; status: InviteStatus; invitedAt: string }>(sql`
    select q.*, i.id as "inviteRowId", i.status, i.created_at as "invitedAt",
      case when iu.id is null then null else ${personJson("iu")} end as inviter
    from community_invite i
    join lateral (${communitySelect(viewerId)} where c.id = i.conversation_id) q on true
    left join "user" iu on iu.id = i.inviter_id
    where i.invitee_id = ${viewerId} and i.status = 'pending'
    order by i.created_at desc
    limit 50
  `);
  return [...rows].map((row) => ({
    id: row.inviteRowId,
    community: toSummary(row),
    inviter: row.inviter,
    status: row.status,
    createdAt: new Date(row.invitedAt).toISOString(),
  }));
}

/** Members, owner and admins first (public communities: anyone; private: members). */
export async function listCommunityMembers(id: string, viewerId: string | null, offset: number, limit: number) {
  const detail = await getCommunity(id, viewerId);
  const rows = await db.execute<{ person: ChatPerson; role: ChatRole; joinedAt: string }>(sql`
    select ${personJson("u")} as person, m.role, m.joined_at as "joinedAt"
    from conversation_member m join "user" u on u.id = m.user_id
    where m.conversation_id = ${detail.id}
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at, m.user_id
    offset ${offset} limit ${limit + 1}
  `);
  const list = [...rows];
  return {
    items: list.slice(0, limit).map((m) => ({ user: m.person, role: m.role, joinedAt: new Date(m.joinedAt).toISOString() })),
    nextOffset: list.length > limit ? offset + limit : null,
  };
}

/** The owner makes someone an admin (or a member again). */
export async function setCommunityRole(id: string, viewerId: string, username: string, role: "admin" | "member"): Promise<void> {
  await db.transaction(async (tx) => {
    await findCommunity(id, tx);
    const membership = await getMembership(id, viewerId, tx);
    if (membership?.member.role !== "owner") throw forbidden("Only the owner can change roles");
    const [target] = await tx
      .select({ userId: conversationMember.userId, role: conversationMember.role })
      .from(conversationMember)
      .innerJoin(user, eq(user.id, conversationMember.userId))
      .where(and(eq(conversationMember.conversationId, id), eq(user.username, normalizeUsername(username))))
      .limit(1);
    if (!target) throw notFound("They're not in this community");
    if (target.role === "owner") throw new ApiError(400, "cannot_change_owner", "The owner stays the owner");
    await tx
      .update(conversationMember)
      .set({ role })
      .where(and(eq(conversationMember.conversationId, id), eq(conversationMember.userId, target.userId)));
    await publishChatEvent(tx, id, "update");
  });
}
