import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { conversation, conversationMember, follow, message, notification, user } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import { ApiError, forbidden, notFound, validationError } from "../lib/errors.js";
import { publishChatEvent, publishEvent } from "../lib/events.js";
import { storage } from "../lib/storage.js";
import { normalizeUsername } from "../lib/username.js";
import {
  CHAT_LIMITS,
  USERNAME_REGEX,
  messagePreview,
  type ChatEvent,
  type ChatKind,
  type ChatMember,
  type ChatMessage,
  type ChatPerson,
  type ChatRole,
  type ConversationDetail,
  type ConversationSummary,
  type InboxFolder,
  type InboxResponse,
  type MessageKind,
  type SharedArticle,
  type SharedProfile,
  type UnreadMessages,
} from "../shared/contracts.js";
import { isUuid } from "./shared.js";

/*
 * Messages, groups and communities (owner 2026-09-30, "like Instagram"). Every chat is a `conversation` with members;
 * a community is a conversation with a name, description and visibility (queries/communities.ts). Writes happen in one
 * transaction with the notifications they cause; every member's open tabs hear `messages.changed` on commit.
 */

export type ConversationRecord = typeof conversation.$inferSelect;
export type MemberRecord = typeof conversationMember.$inferSelect;
export type Membership = { conv: ConversationRecord; member: MemberRecord };

/** `json_build_object` of a ChatPerson for a "user" alias. */
export const personJson = (alias: string): SQL =>
  sql.raw(
    `json_build_object('id', ${alias}.id, 'username', ${alias}.username, 'name', ${alias}.name, 'image', ${alias}.image, ` +
      `'reporterLevel', case when ${alias}.role = 'admin' then 'verified' else ${alias}.reporter_level end)`,
  );

/** "Available" person (onboarded, has a username, not suspended) for a "user" alias. */
export const availableSql = (alias: string): SQL =>
  sql.raw(`(${alias}.onboarded_at is not null and ${alias}.username is not null and ${alias}.suspended_at is null)`);

const iso = (value: string | Date): string => new Date(value).toISOString();

/** The row an insert / update just returned (a missing one is a bug, not a user error). */
export function returned<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new ApiError(500, "internal_error", "Something went wrong. Please try again.");
  return row;
}

/* ─────────────── Access ─────────────── */

export async function getMembership(conversationId: string, userId: string, executor: Executor = db): Promise<Membership | null> {
  if (!isUuid(conversationId)) return null;
  const [row] = await executor
    .select({ conv: conversation, member: conversationMember })
    .from(conversation)
    .innerJoin(conversationMember, and(eq(conversationMember.conversationId, conversation.id), eq(conversationMember.userId, userId)))
    .where(eq(conversation.id, conversationId))
    .limit(1);
  return row ?? null;
}

/** The viewer's membership of a chat, or 404 (a chat you're not in doesn't exist for you). */
export async function requireMembership(conversationId: string, userId: string, executor: Executor = db): Promise<Membership> {
  const found = await getMembership(conversationId, userId, executor);
  if (!found) throw notFound("Chat not found");
  return found;
}

const isManager = (role: ChatRole) => role === "owner" || role === "admin";

export function chatPermissions(conv: Pick<ConversationRecord, "kind">, member: Pick<MemberRecord, "role" | "status">): ConversationDetail["can"] {
  const active = member.status === "active";
  switch (conv.kind) {
    case "direct":
      return { add: false, edit: false, remove: false, delete: true };
    case "group":
      return { add: active, edit: active, remove: isManager(member.role), delete: true };
    case "community":
      return { add: active, edit: isManager(member.role), remove: isManager(member.role), delete: member.role === "owner" };
  }
}

type Person = { id: string; username: string };

/**
 * Onboarded, active accounts for `usernames` (deduplicated, the viewer left out). An unknown handle → 400 naming it.
 */
export async function findPeople(usernames: string[], viewerId: string, executor: Executor = db): Promise<Person[]> {
  const names = [...new Set(usernames.map((u) => normalizeUsername(u)))];
  const bad = names.find((u) => !USERNAME_REGEX.test(u));
  if (bad) throw validationError({ usernames: `Can't find @${bad}` });
  if (names.length === 0) return [];
  const rows = await executor
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(and(inArray(user.username, names), isNotNull(user.onboardedAt), isNull(user.suspendedAt)));
  const found = new Map(rows.map((r) => [r.username ?? "", r.id]));
  const missing = names.find((u) => !found.has(u));
  if (missing) throw validationError({ usernames: `Can't find @${missing}` });
  return names.flatMap((username) => {
    const id = found.get(username);
    return id && id !== viewerId ? [{ id, username }] : [];
  });
}

/** Does `followerId` follow `followingId`? */
async function follows(followerId: string, followingId: string, executor: Executor): Promise<boolean> {
  const [row] = await executor
    .select({ one: sql`1` })
    .from(follow)
    .where(and(eq(follow.followerId, followerId), eq(follow.followingId, followingId)))
    .limit(1);
  return Boolean(row);
}

/** A chat from someone you don't follow is a request until you accept it (Instagram's "Requests"). */
export async function memberStatusFor(userId: string, actorId: string, executor: Executor): Promise<"active" | "request"> {
  return (await follows(userId, actorId, executor)) ? "active" : "request";
}

/**
 * A group / community photo: one of the viewer's own uploaded images (the "avatar" upload), the chat's current photo,
 * or null to remove it.
 */
export function resolveChatImage(image: string | null | undefined, userId: string, current: string | null): string | null | undefined {
  if (image === undefined) return undefined;
  if (image === null) return null;
  if (current && image === current) return current;
  const key = storage.keyFromUrl(image);
  if (!key || !key.startsWith(`avatars/${userId}/`)) throw validationError({ image: "Please upload a photo" });
  return storage.urlFor(key);
}

/* ─────────────── Writing ─────────────── */

type Content =
  | { kind: "text"; body: string }
  | { kind: "article"; articleId: string; articleTitle: string; body: string | null }
  | { kind: "profile"; profileId: string; profileUsername: string; body: string | null };

/**
 * Posts a message: bumps the chat in everyone's inbox, marks it read for the sender (sending also accepts a request),
 * groups a "message" notification per chat for everyone else (who sent it — never what it says, owner 2026-09-30),
 * and pings every member's tabs.
 */
export async function postMessage(executor: Executor, conv: Pick<ConversationRecord, "id" | "kind">, senderId: string, content: Content): Promise<string> {
  const row = returned(await executor
    .insert(message)
    .values({
      conversationId: conv.id,
      senderId,
      kind: content.kind,
      body: content.kind === "text" ? content.body : content.body || null,
      articleId: content.kind === "article" ? content.articleId : null,
      profileId: content.kind === "profile" ? content.profileId : null,
    })
    .returning({ id: message.id, createdAt: message.createdAt }));
  await executor.update(conversation).set({ lastMessageAt: row.createdAt }).where(eq(conversation.id, conv.id));
  await executor
    .update(conversationMember)
    .set({ lastReadAt: row.createdAt, status: "active" })
    .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, senderId)));

  if (conv.kind === "direct") {
    // The other person started following the sender since: their request becomes a normal chat.
    await executor.execute(sql`
      update conversation_member m set status = 'active'
      where m.conversation_id = ${conv.id} and m.user_id <> ${senderId} and m.status = 'request'
        and exists (select 1 from follow f where f.follower_id = m.user_id and f.following_id = ${senderId})
    `);
  }

  await executor.execute(sql`
    insert into notification (user_id, type, actor_id, conversation_id, batch_start)
    select m.user_id, 'message', ${senderId}, ${conv.id}, now()
    from conversation_member m
    where m.conversation_id = ${conv.id} and m.user_id <> ${senderId}
    on conflict (user_id, conversation_id) where read_at is null and type = 'message'
    do update set created_at = now(), actor_id = excluded.actor_id,
      -- Pushed to phones again (replacing the older push), at most every 30 seconds per chat (queries/push.ts).
      pushed_at = case when notification.pushed_at < now() - interval '30 seconds' then null else notification.pushed_at end
  `);
  await publishChatEvent(executor, conv.id, "message");
  return row.id;
}

/** A system line ("Asha added Ravi"): shown in the chat, no bell notification of its own. */
export async function postSystemMessage(
  executor: Executor,
  conversationId: string,
  actorId: string | null,
  event: ChatEvent,
  options: { targetId?: string | null; text?: string | null } = {},
): Promise<void> {
  const row = returned(
    await executor
      .insert(message)
      .values({ conversationId, senderId: actorId, kind: "system", event, targetId: options.targetId ?? null, body: options.text ?? null })
      .returning({ createdAt: message.createdAt }),
  );
  await executor.update(conversation).set({ lastMessageAt: row.createdAt }).where(eq(conversation.id, conversationId));
  if (actorId) {
    await executor
      .update(conversationMember)
      .set({ lastReadAt: row.createdAt })
      .where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, actorId)));
  }
}

/** Pings a user's bell (queued in the caller's transaction). */
export function pingBell(executor: Executor, userId: string): Promise<void> {
  return publishEvent(executor, { t: "notify", id: userId });
}

/** Your one chat with `otherId` (created on first use; the other person's side is a request unless they follow you). */
export async function ensureDirect(executor: Executor, viewerId: string, otherId: string): Promise<ConversationRecord> {
  if (viewerId === otherId) throw new ApiError(400, "cannot_message_self", "You can't message yourself");
  const directKey = [viewerId, otherId].sort().join(":");
  const [created] = await executor.insert(conversation).values({ kind: "direct", directKey }).onConflictDoNothing().returning();
  const conv = created ?? (await executor.select().from(conversation).where(eq(conversation.directKey, directKey)).limit(1))[0];
  if (!conv) throw new ApiError(500, "internal_error", "Couldn't open the chat");
  if (created) {
    await executor.insert(conversationMember).values([
      { conversationId: conv.id, userId: viewerId, role: "member", status: "active" },
      { conversationId: conv.id, userId: otherId, role: "member", status: await memberStatusFor(otherId, viewerId, executor) },
    ]);
  }
  return conv;
}

/** Creates a group chat with the viewer as its owner. Returns its id. */
export async function createGroup(viewerId: string, input: { name?: string | undefined; usernames: string[]; image?: string | null | undefined }): Promise<string> {
  return db.transaction(async (tx) => {
    const people = await findPeople(input.usernames, viewerId, tx);
    if (people.length < 2) throw validationError({ usernames: "Pick at least two people for a group" });
    if (people.length + 1 > CHAT_LIMITS.groupMembersMax) {
      throw validationError({ usernames: `A group holds at most ${CHAT_LIMITS.groupMembersMax} people` });
    }
    const conv = returned(
      await tx
        .insert(conversation)
        .values({ kind: "group", name: input.name || null, image: resolveChatImage(input.image, viewerId, null) ?? null, createdBy: viewerId })
        .returning(),
    );
    await tx.insert(conversationMember).values({ conversationId: conv.id, userId: viewerId, role: "owner", status: "active" });
    for (const person of people) {
      await tx.insert(conversationMember).values({
        conversationId: conv.id,
        userId: person.id,
        role: "member",
        status: await memberStatusFor(person.id, viewerId, tx),
      });
      await tx.insert(notification).values({ userId: person.id, type: "group_added", actorId: viewerId, conversationId: conv.id });
      await pingBell(tx, person.id);
    }
    await postSystemMessage(tx, conv.id, viewerId, "created");
    await publishChatEvent(tx, conv.id, "update");
    return conv.id;
  });
}

/** Adds people to a group (any member who accepted it). Already-members are skipped. */
export async function addGroupMembers(conversationId: string, viewerId: string, usernames: string[]): Promise<number> {
  return db.transaction(async (tx) => {
    const { conv, member } = await requireMembership(conversationId, viewerId, tx);
    if (conv.kind !== "group") throw new ApiError(400, "not_a_group", "Invite people to a community from its page");
    if (!chatPermissions(conv, member).add) throw forbidden("Accept the chat first");
    const people = await findPeople(usernames, viewerId, tx);
    const existing = new Set(
      (await tx.select({ id: conversationMember.userId }).from(conversationMember).where(eq(conversationMember.conversationId, conv.id))).map((r) => r.id),
    );
    const fresh = people.filter((p) => !existing.has(p.id));
    if (existing.size + fresh.length > CHAT_LIMITS.groupMembersMax) {
      throw validationError({ usernames: `A group holds at most ${CHAT_LIMITS.groupMembersMax} people` });
    }
    for (const person of fresh) {
      await tx.insert(conversationMember).values({
        conversationId: conv.id,
        userId: person.id,
        status: await memberStatusFor(person.id, viewerId, tx),
      });
      await postSystemMessage(tx, conv.id, viewerId, "added", { targetId: person.id });
      await tx.insert(notification).values({ userId: person.id, type: "group_added", actorId: viewerId, conversationId: conv.id });
      await pingBell(tx, person.id);
    }
    if (fresh.length > 0) await publishChatEvent(tx, conv.id, "update");
    return fresh.length;
  });
}

/**
 * Leaves a group / community. The owner's role passes to the longest-standing admin (else member); the last one out
 * deletes the chat.
 */
export async function leaveChat(executor: Executor, conv: ConversationRecord, member: MemberRecord): Promise<void> {
  await executor
    .delete(conversationMember)
    .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, member.userId)));
  const [next] = await executor
    .select({ userId: conversationMember.userId, role: conversationMember.role })
    .from(conversationMember)
    .where(eq(conversationMember.conversationId, conv.id))
    .orderBy(sql`case ${conversationMember.role} when 'owner' then 0 when 'admin' then 1 else 2 end`, conversationMember.joinedAt)
    .limit(1);
  if (!next) {
    await executor.delete(conversation).where(eq(conversation.id, conv.id));
    await publishChatEvent(executor, conv.id, "update", [member.userId]);
    return;
  }
  if (member.role === "owner" && next.role !== "owner") {
    await executor
      .update(conversationMember)
      .set({ role: "owner" })
      .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, next.userId)));
  }
  await postSystemMessage(executor, conv.id, member.userId, "left");
  await publishChatEvent(executor, conv.id, "update", [member.userId]);
}

/**
 * "Clear chat" (owner 2026-10-01): every message so far is gone for you — the chat stays in your inbox, empty, for
 * any kind of chat; the others still see everything.
 */
export async function clearChatForViewer(conversationId: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv } = await requireMembership(conversationId, viewerId, tx);
    await tx
      .update(conversationMember)
      .set({ clearedAt: sql`now()`, lastReadAt: sql`now()`, keepListed: true })
      .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, viewerId)));
    await markChatNotificationsRead(tx, conv.id, viewerId);
    await publishChatEvent(tx, conv.id, "update");
  });
}

/**
 * "Delete chat": a direct chat (or request) disappears from your inbox with its history — it comes back with the next
 * message; a group / community is left.
 */
export async function deleteChatForViewer(conversationId: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv, member } = await requireMembership(conversationId, viewerId, tx);
    if (conv.kind === "direct") {
      await tx
        .update(conversationMember)
        .set({ clearedAt: sql`now()`, lastReadAt: sql`now()`, keepListed: false })
        .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, viewerId)));
      await markChatNotificationsRead(tx, conv.id, viewerId);
      await publishChatEvent(tx, conv.id, "update");
      return;
    }
    if (conv.kind === "community" && member.role === "owner") {
      throw new ApiError(409, "owner_cannot_leave", "You own this community — delete it from its page instead");
    }
    await leaveChat(tx, conv, member);
  });
}

/** Removes someone from a group / community (owner and admins; an admin can't remove the owner or another admin). */
export async function removeMember(conversationId: string, viewerId: string, username: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv, member } = await requireMembership(conversationId, viewerId, tx);
    if (conv.kind === "direct" || !chatPermissions(conv, member).remove) throw forbidden("Only admins can remove people");
    const [target] = await tx
      .select({ member: conversationMember })
      .from(conversationMember)
      .innerJoin(user, eq(user.id, conversationMember.userId))
      .where(and(eq(conversationMember.conversationId, conv.id), eq(user.username, normalizeUsername(username))))
      .limit(1);
    if (!target) throw notFound("They're not in this chat");
    if (target.member.userId === viewerId) throw new ApiError(400, "cannot_remove_self", "Leave the chat instead");
    if (target.member.role === "owner" || (target.member.role === "admin" && member.role !== "owner")) {
      throw forbidden("Only the owner can remove an admin");
    }
    await tx
      .delete(conversationMember)
      .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, target.member.userId)));
    await postSystemMessage(tx, conv.id, viewerId, "removed", { targetId: target.member.userId });
    await publishChatEvent(tx, conv.id, "update", [target.member.userId]);
  });
}

/** Renames a group / changes its photo (any member who accepted it). */
export async function updateGroup(conversationId: string, viewerId: string, input: { name?: string | undefined; image?: string | null | undefined }): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv, member } = await requireMembership(conversationId, viewerId, tx);
    if (conv.kind !== "group") throw new ApiError(400, "not_a_group", "Only group chats can be renamed here");
    if (!chatPermissions(conv, member).edit) throw forbidden("Accept the chat first");
    await applyChatDetails(tx, conv, viewerId, { name: input.name === undefined ? undefined : input.name || null, image: input.image });
  });
}

/** Writes a new name / photo and the matching system lines. */
export async function applyChatDetails(
  executor: Executor,
  conv: ConversationRecord,
  viewerId: string,
  input: { name?: string | null | undefined; image?: string | null | undefined; description?: string | null | undefined; visibility?: "public" | "private" | undefined },
): Promise<void> {
  const image = resolveChatImage(input.image, viewerId, conv.image);
  const changes: Partial<typeof conversation.$inferInsert> = {};
  if (input.name !== undefined && input.name !== conv.name) changes.name = input.name;
  if (image !== undefined && image !== conv.image) changes.image = image;
  if (input.description !== undefined && input.description !== conv.description) changes.description = input.description;
  if (input.visibility !== undefined && input.visibility !== conv.visibility) changes.visibility = input.visibility;
  if (Object.keys(changes).length === 0) return;
  await executor.update(conversation).set({ ...changes, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
  if (changes.name !== undefined) await postSystemMessage(executor, conv.id, viewerId, "renamed", { text: changes.name ?? "" });
  if (changes.image !== undefined) await postSystemMessage(executor, conv.id, viewerId, "photo");
  await publishChatEvent(executor, conv.id, "update");
}

/** Marks the "message" bell rows of one chat read for a user. */
async function markChatNotificationsRead(executor: Executor, conversationId: string, userId: string): Promise<void> {
  const marked = await executor
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), eq(notification.conversationId, conversationId), eq(notification.type, "message"), isNull(notification.readAt)))
    .returning({ id: notification.id });
  if (marked.length > 0) await pingBell(executor, userId);
}

/** The viewer has seen the chat: read up to now ("Seen" for the others) and its bell rows read. */
export async function markChatRead(conversationId: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv } = await requireMembership(conversationId, viewerId, tx);
    await tx
      .update(conversationMember)
      .set({ lastReadAt: sql`greatest(${conversationMember.lastReadAt}, now())` })
      .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, viewerId)));
    await markChatNotificationsRead(tx, conv.id, viewerId);
    await publishChatEvent(tx, conv.id, "read");
  });
}

/** Accepts a message request: the chat moves to your inbox. */
export async function acceptRequest(conversationId: string, viewerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { conv } = await requireMembership(conversationId, viewerId, tx);
    await tx
      .update(conversationMember)
      .set({ status: "active" })
      .where(and(eq(conversationMember.conversationId, conv.id), eq(conversationMember.userId, viewerId)));
    await publishChatEvent(tx, conv.id, "update");
  });
}

/** Unsends one of your own messages (for everyone). */
export async function unsendMessage(conversationId: string, messageId: string, viewerId: string): Promise<void> {
  if (!isUuid(messageId)) throw notFound("Message not found");
  await db.transaction(async (tx) => {
    const { conv } = await requireMembership(conversationId, viewerId, tx);
    const removed = await tx
      .delete(message)
      .where(and(eq(message.id, messageId), eq(message.conversationId, conv.id), eq(message.senderId, viewerId), sql`${message.kind} <> 'system'`))
      .returning({ id: message.id });
    if (removed.length === 0) throw notFound("Message not found");
    await publishChatEvent(tx, conv.id, "update");
  });
}

/* ─────────────── Reading ─────────────── */

type SummaryRow = {
  id: string;
  kind: ChatKind;
  name: string | null;
  image: string | null;
  description: string | null;
  visibility: "public" | "private" | null;
  lastMessageAt: string;
  role: ChatRole;
  status: "active" | "request";
  memberCount: number;
  preview: ChatPerson[] | null;
  unread: number;
  peerActiveAt: string | null;
  lmKind: MessageKind | null;
  lmBody: string | null;
  lmEvent: ChatEvent | null;
  lmCreatedAt: string | null;
  lmSenderId: string | null;
  lmSenderName: string | null;
  lmTargetName: string | null;
  lmArticleTitle: string | null;
  lmProfileUsername: string | null;
};

/** The chat summaries (viewer's side) matching `where` (over `c` = conversation, `me` = the viewer's membership). */
async function selectSummaries(viewerId: string, where: SQL, limit: number): Promise<SummaryRow[]> {
  const result = await db.execute<SummaryRow>(sql`
    select c.id, c.kind, c.name, c.image, c.description, c.visibility, c.last_message_at as "lastMessageAt",
      me.role, me.status,
      (select count(*)::int from conversation_member cm where cm.conversation_id = c.id) as "memberCount",
      (select pu.last_active_at from conversation_member pm join "user" pu on pu.id = pm.user_id
        where c.kind = 'direct' and pm.conversation_id = c.id and pm.user_id <> ${viewerId} limit 1) as "peerActiveAt",
      (select json_agg(p.person order by p.joined_at)
        from (select ${personJson("pu")} as person, pm.joined_at
          from conversation_member pm join "user" pu on pu.id = pm.user_id
          where pm.conversation_id = c.id and pm.user_id <> ${viewerId}
          order by case pm.role when 'owner' then 0 when 'admin' then 1 else 2 end, pm.joined_at
          limit 3) p) as preview,
      (select count(*)::int from message u
        where u.conversation_id = c.id and u.created_at > greatest(me.last_read_at, coalesce(me.cleared_at, me.last_read_at))
          and u.sender_id is distinct from ${viewerId}) as unread,
      lm.kind as "lmKind", lm.body as "lmBody", lm.event as "lmEvent", lm.created_at as "lmCreatedAt",
      lm.sender_id as "lmSenderId", lm.sender_name as "lmSenderName", lm.target_name as "lmTargetName",
      lm.article_title as "lmArticleTitle", lm.profile_username as "lmProfileUsername"
    from conversation_member me
    join conversation c on c.id = me.conversation_id
    left join lateral (
      select x.kind, x.body, x.event, x.created_at, x.sender_id, su.name as sender_name, tu.name as target_name,
        a.title as article_title, pu.username as profile_username
      from message x
      left join "user" su on su.id = x.sender_id
      left join "user" tu on tu.id = x.target_id
      left join article a on a.id = x.article_id
      left join "user" pu on pu.id = x.profile_id
      where x.conversation_id = c.id and (me.cleared_at is null or x.created_at > me.cleared_at)
      order by x.created_at desc, x.id desc
      limit 1
    ) lm on true
    where me.user_id = ${viewerId} and ${where}
    order by c.last_message_at desc, c.id desc
    limit ${limit}
  `);
  return [...result];
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function toSummary(row: SummaryRow, viewerId: string): ConversationSummary {
  const preview = row.preview ?? [];
  const peer = row.kind === "direct" ? (preview[0] ?? null) : null;
  let title: string;
  if (row.kind === "direct") title = peer?.name || (peer ? `@${peer.username}` : "WebNEWS user");
  else if (row.name) title = row.name;
  else {
    const names = preview.map((p) => firstName(p.name || p.username));
    const others = row.memberCount - 1 - names.length;
    title = names.length === 0 ? "Just you" : others > 0 ? `${names.join(", ")} and ${others} more` : names.join(", ");
  }
  const mine = row.lmSenderId === viewerId;
  const lastMessage =
    row.lmKind && row.lmCreatedAt
      ? {
          preview: messagePreview({
            kind: row.lmKind,
            text: row.lmBody,
            event: row.lmEvent,
            article: row.lmArticleTitle ? ({ title: row.lmArticleTitle } as SharedArticle) : null,
            profile: row.lmProfileUsername ? ({ username: row.lmProfileUsername } as SharedProfile) : null,
            target: row.lmTargetName ? ({ name: row.lmTargetName } as ChatPerson) : null,
            senderName: mine ? "You" : row.lmSenderName,
          }),
          senderName: row.lmSenderName,
          mine,
          createdAt: iso(row.lmCreatedAt),
        }
      : null;
  return {
    id: row.id,
    kind: row.kind,
    title,
    image: row.image,
    peer,
    peerActiveAt: row.peerActiveAt ? iso(row.peerActiveAt) : null,
    preview,
    memberCount: row.memberCount,
    lastMessage,
    unread: row.unread,
    request: row.status === "request",
    role: row.role,
    lastMessageAt: iso(row.lastMessageAt),
  };
}

/** Chats that show in a folder: direct chats only once they have a message you haven't deleted (or you cleared it). */
const listedSql = sql`(c.kind <> 'direct' or me.keep_listed or exists (
  select 1 from message v where v.conversation_id = c.id and (me.cleared_at is null or v.created_at > me.cleared_at)))`;

export async function countUnreadChats(userId: string, executor: Executor = db): Promise<UnreadMessages> {
  const result = await executor.execute<{ unread: number; requests: number }>(sql`
    select
      count(*) filter (where me.status = 'active' and exists (
        select 1 from message u where u.conversation_id = me.conversation_id
          and u.created_at > greatest(me.last_read_at, coalesce(me.cleared_at, me.last_read_at)) and u.sender_id is distinct from ${userId}))::int as unread,
      count(*) filter (where me.status = 'request' and exists (
        select 1 from message v where v.conversation_id = me.conversation_id and v.sender_id is distinct from ${userId}
          and (me.cleared_at is null or v.created_at > me.cleared_at)))::int as requests
    from conversation_member me
    where me.user_id = ${userId}
  `);
  const row = [...result][0];
  return { unread: row?.unread ?? 0, requests: row?.requests ?? 0 };
}

/** The inbox: your chats (or message requests), latest activity first. */
export async function listInbox(viewerId: string, folder: InboxFolder, rawCursor: string | undefined, limit: number): Promise<InboxResponse> {
  const cursor = decodeCursor(rawCursor);
  if (cursor && !isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  const where = sql`me.status = ${folder === "requests" ? "request" : "active"} and ${listedSql} ${
    cursor ? sql`and (c.last_message_at, c.id) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : sql``
  }`;
  const rows = await selectSummaries(viewerId, where, limit + 1);
  const page = paginate(rows, limit, (row) => ({ at: new Date(row.lastMessageAt), id: row.id }));
  const counts = await countUnreadChats(viewerId);
  return { items: page.items.map((row) => toSummary(row, viewerId)), nextCursor: page.nextCursor, ...counts };
}

/** People you've chatted with recently, and your groups / communities — the top of the "Send to" sheet. */
export async function listRecentChats(viewerId: string, limit: number): Promise<ConversationSummary[]> {
  const rows = await selectSummaries(viewerId, sql`me.status = 'active' and ${listedSql}`, limit);
  return rows.map((row) => toSummary(row, viewerId));
}

const MEMBERS_SHOWN = 100;

export async function getConversationDetail(conversationId: string, viewerId: string): Promise<ConversationDetail> {
  const { conv, member } = await requireMembership(conversationId, viewerId);
  const [row] = await selectSummaries(viewerId, sql`c.id = ${conv.id}`, 1);
  if (!row) throw notFound("Chat not found");
  const members = await db.execute<{ person: ChatPerson; role: ChatRole; joinedAt: string; lastReadAt: string }>(sql`
    select ${personJson("u")} as person, m.role, m.joined_at as "joinedAt", m.last_read_at as "lastReadAt"
    from conversation_member m join "user" u on u.id = m.user_id
    where m.conversation_id = ${conv.id}
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at, m.user_id
    limit ${MEMBERS_SHOWN}
  `);
  const list = [...members];
  const peerRow = conv.kind === "direct" ? list.find((m) => m.person.id !== viewerId) : undefined;
  return {
    ...toSummary(row, viewerId),
    members: list.map((m): ChatMember => ({ user: m.person, role: m.role, joinedAt: iso(m.joinedAt) })),
    description: conv.description,
    visibility: conv.visibility,
    peerReadAt: peerRow ? iso(peerRow.lastReadAt) : null,
    can: chatPermissions(conv, member),
  };
}

type MessageRow = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  body: string | null;
  event: ChatEvent | null;
  createdAt: string;
  senderId: string | null;
  sender: ChatPerson | null;
  target: ChatPerson | null;
  profile: SharedProfile | null;
  article: SharedArticle | null;
};

const MESSAGE_SELECT = sql`
  select x.id, x.conversation_id as "conversationId", x.kind, x.body, x.event, x.created_at as "createdAt", x.sender_id as "senderId",
    case when su.id is null then null else ${personJson("su")} end as sender,
    case when tu.id is null then null else ${personJson("tu")} end as target,
    case when pu.id is not null and ${availableSql("pu")}
      then (${personJson("pu")})::jsonb || jsonb_build_object('bio', pu.bio) end as profile,
    case when a.id is not null and a.status = 'published' and a.hidden_at is null and ${availableSql("au")}
      then json_build_object('id', a.id, 'slug', a.slug, 'title', a.title, 'excerpt', coalesce(a.excerpt, ''),
        'coverUrl', a.cover_url, 'coverBlur', a.cover_blur, 'author', ${personJson("au")}) end as article
  from message x
  left join "user" su on su.id = x.sender_id
  left join "user" tu on tu.id = x.target_id
  left join "user" pu on pu.id = x.profile_id
  left join article a on a.id = x.article_id
  left join "user" au on au.id = a.author_id
`;

function toChatMessage(row: MessageRow, viewerId: string): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    sender: row.sender,
    text: row.body,
    article: row.kind === "article" ? row.article : null,
    profile: row.kind === "profile" ? row.profile : null,
    event: row.event,
    target: row.target,
    createdAt: iso(row.createdAt),
    mine: row.senderId === viewerId && row.kind !== "system",
  };
}

/** A chat's messages, newest first (cursor pages); only those after the viewer last deleted the chat. */
export async function listMessages(conversationId: string, viewerId: string, rawCursor: string | undefined, limit: number) {
  const { conv, member } = await requireMembership(conversationId, viewerId);
  const cursor = decodeCursor(rawCursor);
  if (cursor && !isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  const result = await db.execute<MessageRow>(sql`
    ${MESSAGE_SELECT}
    where x.conversation_id = ${conv.id}
      ${member.clearedAt ? sql`and x.created_at > ${member.clearedAt.toISOString()}::timestamptz` : sql``}
      ${cursor ? sql`and (x.created_at, x.id) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : sql``}
    order by x.created_at desc, x.id desc
    limit ${limit + 1}
  `);
  const page = paginate([...result], limit, (row) => ({ at: new Date(row.createdAt), id: row.id }));
  return { items: page.items.map((row) => toChatMessage(row, viewerId)), nextCursor: page.nextCursor };
}

export async function getMessage(messageId: string, viewerId: string): Promise<ChatMessage | null> {
  const result = await db.execute<MessageRow>(sql`${MESSAGE_SELECT} where x.id = ${messageId}`);
  const row = [...result][0];
  return row ? toChatMessage(row, viewerId) : null;
}

/** Remembered so the "Send to" sheet and search can also offer people you follow. */
export async function listFollowedPeople(viewerId: string, limit: number): Promise<ChatPerson[]> {
  const result = await db.execute<{ person: ChatPerson }>(sql`
    select ${personJson("u")} as person
    from follow f join "user" u on u.id = f.following_id
    where f.follower_id = ${viewerId} and ${availableSql("u")}
    order by f.created_at desc
    limit ${limit}
  `);
  return [...result].map((r) => r.person);
}
