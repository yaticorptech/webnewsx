import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { article, follow, pressPass, user, type PressPassRecord, type UserRecord } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import type { Page, ProfileData, UserRow, ViewerUser } from "../shared/contracts.js";
import { countUnreadNotices } from "./notices.js";
import { countUnreadChats } from "./messages.js";
import { countUnreadNotifications } from "./notifications.js";
import { findActivePass, toPassSummary, toProfilePress } from "./press-pass.js";
import { profileMembership } from "./memberships.js";
import { toReporterLevel } from "../lib/roles.js";
import { badgeLevelSql, beforeCursor, descNullsLast } from "./shared.js";

type ViewerRecord = Pick<
  UserRecord,
  "id" | "username" | "name" | "image" | "email" | "phoneNumber" | "bio" | "onboardedAt" | "role" | "reporterLevel" | "suspendedAt" | "preferredLanguages" | "posterOverlayUrl" | "accountType"
>;

export function toViewerUser(
  record: ViewerRecord,
  pass: PressPassRecord | null,
  unreadNotices = 0,
  unreadNotifications = 0,
  unreadMessages = 0,
): ViewerUser {
  return {
    id: record.id,
    username: record.username ?? null,
    name: record.name ?? "",
    image: record.image ?? null,
    email: record.email,
    phoneNumber: record.phoneNumber ?? null,
    bio: record.bio ?? null,
    onboarded: Boolean(record.onboardedAt),
    role: record.role,
    reporterLevel: pass && !pass.revokedAt ? pass.level : null,
    pressPass: pass ? toPassSummary(pass) : null,
    suspended: Boolean(record.suspendedAt),
    languages: record.preferredLanguages ?? [],
    posterOverlayUrl: record.posterOverlayUrl ?? null,
    unreadNotices,
    unreadNotifications,
    unreadMessages,
    accountType: record.accountType,
  };
}

/** `ViewerUser` for an account id (user row + Press Pass), or null. */
export async function getViewerUser(id: string, executor: Executor = db): Promise<ViewerUser | null> {
  const [row] = await executor.select({ user, pass: pressPass }).from(user).leftJoin(pressPass, eq(pressPass.userId, user.id)).where(eq(user.id, id)).limit(1);
  if (!row) return null;
  const [notices, notifications, chats, published] = await Promise.all([
    countUnreadNotices(id, executor),
    countUnreadNotifications(id, executor),
    countUnreadChats(id, executor),
    executor
      .select({ n: sql<number>`count(*)::int` })
      .from(article)
      .where(and(eq(article.authorId, id), eq(article.status, "published"))),
  ]);
  return { ...toViewerUser(row.user, row.pass, notices, notifications, chats.unread), publishedStories: published[0]?.n ?? 0 };
}

export async function findUserById(id: string, executor: Executor = db): Promise<UserRecord | null> {
  const [row] = await executor.select().from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
}

/**
 * Onboarded user by username (profiles only exist once onboarding is complete). Suspended accounts
 * are hidden from everyone except the Editor Desk (`includeSuspended`).
 */
export async function findProfileUser(username: string, options: { includeSuspended?: boolean } = {}): Promise<UserRecord | null> {
  const conditions: SQL[] = [eq(user.username, username), isNotNull(user.onboardedAt)];
  if (!options.includeSuspended) conditions.push(isNull(user.suspendedAt));
  const [row] = await db
    .select()
    .from(user)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/** True when another account already owns `username`. */
export async function isUsernameTaken(username: string, exceptUserId: string | null): Promise<boolean> {
  const conditions: SQL[] = [eq(user.username, username)];
  if (exceptUserId) conditions.push(ne(user.id, exceptUserId));
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/** Subset of `candidates` already registered. */
export async function takenUsernames(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db.select({ username: user.username }).from(user).where(inArray(user.username, candidates));
  return new Set(rows.map((r) => r.username).filter((u): u is string => Boolean(u)));
}

export async function profileCounts(userId: string): Promise<ProfileData["counts"]> {
  const [row] = await db
    .select({
      articles: sql<number>`(select count(*)::int from ${article} where ${article.authorId} = ${userId} and ${article.status} = 'published' and ${article.hiddenAt} is null)`,
      followers: sql<number>`(select count(*)::int from ${follow} where ${follow.followingId} = ${userId})`,
      following: sql<number>`(select count(*)::int from ${follow} where ${follow.followerId} = ${userId})`,
    })
    .from(sql`(select 1) as one`);
  return { articles: row?.articles ?? 0, followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

export async function followerCount(userId: string, executor: Executor = db): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(follow)
    .where(eq(follow.followingId, userId));
  return row?.n ?? 0;
}

export async function viewerFollows(viewerId: string | null, targetId: string): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(follow)
    .where(and(eq(follow.followerId, viewerId), eq(follow.followingId, targetId)))
    .limit(1);
  return Boolean(row);
}

export async function getProfile(username: string, viewer: { id: string; role: string } | null): Promise<ProfileData | null> {
  const viewerId = viewer?.id ?? null;
  const record = await findProfileUser(username, { includeSuspended: viewer?.role === "admin" });
  if (!record || !record.username) return null;
  const [counts, follows, pass, membership] = await Promise.all([
    profileCounts(record.id),
    viewerFollows(viewerId, record.id),
    findActivePass(record.id),
    profileMembership(record, viewerId),
  ]);
  return {
    user: {
      id: record.id,
      username: record.username,
      name: record.name,
      image: record.image,
      bio: record.bio,
      createdAt: record.createdAt.toISOString(),
      role: record.role,
      accountType: record.accountType,
    },
    counts,
    viewer: { isSelf: viewerId === record.id, follows },
    press: pass ? toProfilePress(pass) : null,
    membership,
  };
}

/* ─────────────── User rows ─────────────── */

/**
 * Fully qualified `"user"."id"` for correlated subqueries: drizzle renders `${user.id}` unqualified
 * inside a single-table select list, where it would bind to the subquery's own `id` column.
 */
const USER_ID = sql.raw('"user"."id"');

function userRowColumns(viewerId: string | null) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    image: user.image,
    bio: user.bio,
    reporterLevel: badgeLevelSql,
    viewerFollows: viewerId
      ? sql<boolean>`exists (select 1 from ${follow} vf where vf.follower_id = ${viewerId} and vf.following_id = ${USER_ID})`
      : sql<boolean>`false`,
  };
}

type UserRowRecord = {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  bio: string | null;
  reporterLevel: string | null;
  viewerFollows: boolean;
};

function toUserRow(row: UserRowRecord, viewerId: string | null): UserRow {
  return {
    id: row.id,
    username: row.username ?? "",
    name: row.name,
    image: row.image,
    bio: row.bio,
    viewerFollows: Boolean(row.viewerFollows) && row.id !== viewerId,
    isViewer: row.id === viewerId,
    reporterLevel: toReporterLevel(row.reporterLevel),
  };
}

/**
 * Followers (`direction = "followers"`) or followed accounts (`"following"`) of `userId`,
 * newest relationship first; cursor = (follow.createdAt, other user id).
 */
export async function listFollowUsers(opts: {
  userId: string;
  direction: "followers" | "following";
  viewerId: string | null;
  cursor: string | undefined;
  limit: number;
}): Promise<Page<UserRow>> {
  const cursor = decodeCursor(opts.cursor);
  const isFollowers = opts.direction === "followers";
  const anchor = isFollowers ? follow.followingId : follow.followerId;
  const other = isFollowers ? follow.followerId : follow.followingId;
  const conditions: SQL[] = [eq(anchor, opts.userId), isNotNull(user.onboardedAt), isNull(user.suspendedAt)];
  if (cursor) conditions.push(beforeCursor(follow.createdAt, other, cursor, "text"));
  const rows = await db
    .select({ ...userRowColumns(opts.viewerId), followedAt: follow.createdAt })
    .from(follow)
    .innerJoin(user, eq(user.id, other))
    .where(and(...conditions))
    .orderBy(descNullsLast(follow.createdAt), descNullsLast(other))
    .limit(opts.limit + 1);
  const page = paginate(rows, opts.limit, (row) => ({ at: row.followedAt, id: row.id }));
  return { items: page.items.map((row) => toUserRow(row, opts.viewerId)), nextCursor: page.nextCursor };
}

/**
 * "Publishers to follow": onboarded, non-suspended users with at least one visible published article,
 * most followed first. The viewer is excluded.
 */
export async function listTopPublishers(viewerId: string | null, limit: number): Promise<UserRow[]> {
  const followers = sql<number>`(select count(*)::int from ${follow} tf where tf.following_id = ${USER_ID})`;
  const published = sql<number>`(select count(*)::int from ${article} ta where ta.author_id = ${USER_ID} and ta.status = 'published' and ta.hidden_at is null)`;
  const conditions: SQL[] = [isNotNull(user.onboardedAt), isNotNull(user.username), isNull(user.suspendedAt), sql`${published} > 0`];
  if (viewerId) conditions.push(ne(user.id, viewerId));
  const rows = await db
    .select({ ...userRowColumns(viewerId), followers, published })
    .from(user)
    .where(and(...conditions))
    .orderBy(desc(followers), desc(published), desc(user.createdAt))
    .limit(limit);
  return rows.map((row) => toUserRow(row, viewerId));
}

/** `%q%` for ILIKE with the wildcard characters in `q` escaped. */
const containsPattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
const prefixPattern = (q: string) => `${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/**
 * Instant search (people): onboarded, non-suspended accounts whose username or display name contains `q`.
 * Exact username first, then username / name prefixes, then the rest — most followed first within each group.
 */
export async function searchUsers(q: string, viewerId: string | null, limit: number): Promise<UserRow[]> {
  const needle = q.toLowerCase();
  const followers = sql<number>`(select count(*)::int from ${follow} sf where sf.following_id = ${USER_ID})`;
  const rank = sql<number>`case
    when lower(${user.username}) = ${needle} then 0
    when lower(${user.username}) like ${prefixPattern(needle)} then 1
    when lower(${user.name}) like ${prefixPattern(needle)} then 2
    else 3 end`;
  const rows = await db
    .select({ ...userRowColumns(viewerId), rank, followers })
    .from(user)
    .where(
      and(
        isNotNull(user.onboardedAt),
        isNotNull(user.username),
        isNull(user.suspendedAt),
        or(ilike(user.username, containsPattern(needle)), ilike(user.name, containsPattern(needle))),
      ),
    )
    .orderBy(asc(rank), desc(followers), asc(user.username))
    .limit(limit);
  return rows.map((row) => toUserRow(row, viewerId));
}
