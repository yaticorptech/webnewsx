import { and, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "../db/client.js";
import { article, articleFlag, communityInvite, conversation, conversationMember, notification, pressMeet, user } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import { publishEvent } from "../lib/events.js";
import type {
  AppNotification,
  FlagReason,
  NotificationsResponse,
  ReasonCount,
  ReportedStoriesResponse,
  ReportedStory,
} from "../shared/contracts.js";

/*
 * The bell (owner 2026-09-28): new stories from publishers you follow, every report on your stories (reason + note,
 * never who reported) and stories hidden after too many reports. Rows are written in the same transaction as the
 * change they describe; the recipient's open tabs are pinged on commit (`notifications.changed`, only to them).
 */

/** Pings a user's open tabs that their bell changed (queued in the caller's transaction). */
function pingBell(executor: Executor, userId: string): Promise<void> {
  return publishEvent(executor, { t: "notify", id: userId });
}

/**
 * A story went live → one "new_story" notification per follower of its author (once per story: a re-publish doesn't
 * repeat it). Followers' tabs refresh their bell from the public `article.published` event.
 */
export async function notifyFollowers(executor: Executor, articleId: string): Promise<void> {
  await executor.execute(sql`
    insert into notification (user_id, type, actor_id, article_id, article_title)
    select f.follower_id, 'new_story', a.author_id, a.id, a.title
    from article a
    join follow f on f.following_id = a.author_id and f.notify
    where a.id = ${articleId} and a.status = 'published'
    on conflict do nothing
  `);
}

/** Someone started following `userId` (once per follower). */
export async function notifyFollowed(executor: Executor, userId: string, followerId: string): Promise<void> {
  const inserted = await executor
    .insert(notification)
    .values({ userId, type: "new_follower", actorId: followerId })
    .onConflictDoNothing()
    .returning({ id: notification.id });
  if (inserted.length > 0) await pingBell(executor, userId);
}

type StoryRef = { id: string; authorId: string; title: string | null };

const titleOf = (story: StoryRef) => story.title ?? "Untitled story";

const SNIPPET_MAX = 140;
const snippet = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : flat;
};

/**
 * Likes and comments are grouped per article like Instagram ("Harikiran and 9 others liked your article"): while the
 * author hasn't seen it, each new one bumps the same row to the top (latest named reader, latest comment text); once
 * seen, the next one starts a new group. The count is worked out when listing (likes / comments since the group
 * started), so unlikes and deleted comments are never counted.
 */
async function bumpGroup(
  executor: Executor,
  type: "story_liked" | "story_commented",
  story: StoryRef,
  actorId: string | null,
  note: string | null,
): Promise<void> {
  await executor.execute(sql`
    insert into notification (user_id, type, actor_id, article_id, article_title, note, batch_start)
    values (${story.authorId}, ${type}, ${actorId}, ${story.id}, ${titleOf(story)}, ${note}, now())
    on conflict (user_id, article_id, type) where read_at is null and type in ('story_liked', 'story_commented')
    do update set
      created_at = now(),
      actor_id = coalesce(excluded.actor_id, notification.actor_id),
      note = coalesce(excluded.note, notification.note),
      article_title = excluded.article_title,
      -- Pushed to phones again (the newer push replaces the older one), at most once a minute (queries/push.ts).
      pushed_at = case when notification.pushed_at < now() - interval '1 minute' then null else notification.pushed_at end
  `);
  await pingBell(executor, story.authorId);
}

/** Someone liked the author's article (`likerId` null = a logged-out visitor). The author's own likes don't count. */
export async function notifyLiked(executor: Executor, story: StoryRef, likerId: string | null): Promise<void> {
  if (likerId === story.authorId) return;
  await bumpGroup(executor, "story_liked", story, likerId, null);
}

/** Someone commented on (or replied under) the author's article. The author's own comments don't count. */
export async function notifyCommented(executor: Executor, story: StoryRef, commenterId: string, body: string): Promise<void> {
  if (commenterId === story.authorId) return;
  await bumpGroup(executor, "story_commented", story, commenterId, snippet(body));
}

/** A reader reported one of the author's stories: the reason and their note, never who they are. */
export async function notifyReported(executor: Executor, story: StoryRef, reason: FlagReason, note: string | null | undefined): Promise<void> {
  await executor.insert(notification).values({
    userId: story.authorId,
    type: "story_reported",
    articleId: story.id,
    articleTitle: titleOf(story),
    reason,
    note: note?.trim() || null,
  });
  await pingBell(executor, story.authorId);
}

/**
 * The Editor Desk returned a story the author sent for review, with its note (owner 2026-10-01). No actor: it comes
 * from the Desk, not a named editor.
 */
export async function notifyReturned(executor: Executor, story: StoryRef, note: string): Promise<void> {
  await executor.insert(notification).values({
    userId: story.authorId,
    type: "story_returned",
    articleId: story.id,
    articleTitle: titleOf(story),
    note: note.trim() || null,
  });
  await pingBell(executor, story.authorId);
}

/** The Editor Desk warned the author about a reported story (owner 2026-10-01): its note, if it wrote one. */
export async function notifyWarned(executor: Executor, story: StoryRef, note: string | null): Promise<void> {
  await executor.insert(notification).values({
    userId: story.authorId,
    type: "story_warned",
    articleId: story.id,
    articleTitle: titleOf(story),
    note: note?.trim() || null,
  });
  await pingBell(executor, story.authorId);
}

/** The report rules hid one of the author's stories: how many readers reported it, and why. */
export async function notifyHidden(executor: Executor, story: StoryRef, reports: number, reasons: ReasonCount[]): Promise<void> {
  await executor.insert(notification).values({
    userId: story.authorId,
    type: "story_hidden",
    articleId: story.id,
    articleTitle: titleOf(story),
    reports,
    reasons,
    // Written in the same transaction as the report that tipped it over (same now()): list it just above that one.
    createdAt: sql`now() + interval '1 millisecond'`,
  });
  await pingBell(executor, story.authorId);
}

export async function countUnreadNotifications(userId: string, executor: Executor = db): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.n ?? 0;
}

const actor = alias(user, "actor");

/** Newest first, cursor-paginated. */
export async function listNotifications(userId: string, rawCursor: string | undefined, limit: number): Promise<NotificationsResponse> {
  const cursor = decodeCursor(rawCursor);
  const rows = await db
    .select({
      n: notification,
      actorId: actor.id,
      actorUsername: actor.username,
      actorName: actor.name,
      actorImage: actor.image,
      slug: article.slug,
      status: article.status,
      hiddenAt: article.hiddenAt,
      chatId: conversation.id,
      chatKind: conversation.kind,
      chatName: conversation.name,
      chatStatus: conversationMember.status,
      inviteStatus: communityInvite.status,
      meetTitle: pressMeet.title,
      meetStartsAt: pressMeet.startsAt,
      meetPlatform: pressMeet.platform,
      // Grouped likes / comments since the group started — never the author's own.
      groupCount: sql<number | null>`case
        when ${notification.type} = 'story_liked' then
          (select count(*) from article_like l
            where l.article_id = ${notification.articleId} and l.created_at >= ${notification.batchStart} and l.user_id <> ${notification.userId})
          + (select count(*) from article_anon_like v
            where v.article_id = ${notification.articleId} and v.created_at >= ${notification.batchStart})
        when ${notification.type} = 'story_commented' then
          (select count(*) from article_comment c
            where c.article_id = ${notification.articleId} and c.created_at >= ${notification.batchStart} and c.author_id <> ${notification.userId})
        when ${notification.type} = 'message' then
          (select count(*) from message m
            where m.conversation_id = ${notification.conversationId} and m.created_at >= ${notification.batchStart}
              and m.kind <> 'system' and m.sender_id is distinct from ${notification.userId})
      end::int`,
    })
    .from(notification)
    .leftJoin(actor, eq(actor.id, notification.actorId))
    .leftJoin(article, eq(article.id, notification.articleId))
    .leftJoin(conversation, eq(conversation.id, notification.conversationId))
    .leftJoin(
      conversationMember,
      and(eq(conversationMember.conversationId, notification.conversationId), eq(conversationMember.userId, notification.userId)),
    )
    .leftJoin(communityInvite, eq(communityInvite.id, notification.inviteId))
    .leftJoin(pressMeet, eq(pressMeet.id, notification.pressMeetId))
    .where(
      and(
        eq(notification.userId, userId),
        cursor
          ? or(lt(notification.createdAt, cursor.at), and(eq(notification.createdAt, cursor.at), lt(notification.id, cursor.id)))
          : undefined,
      ),
    )
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(limit + 1);

  const page = paginate(rows, limit, (row) => ({ at: row.n.createdAt, id: row.n.id }));
  // A group whose likes were all taken back (or comments all deleted / messages unsent) says nothing any more.
  const visible = page.items.filter((row) => row.groupCount === null || row.groupCount > 0);
  const items: AppNotification[] = visible.map((row) => {
    const n = row.n;
    // Followers can't open a story that was hidden since; its author (reports, hidden) still can.
    const openable = row.status === "published" && (!row.hiddenAt || n.type !== "new_story");
    return {
      id: n.id,
      type: n.type,
      actor:
        row.actorId && row.actorUsername
          ? { id: row.actorId, username: row.actorUsername, name: row.actorName ?? row.actorUsername, image: row.actorImage }
          : null,
      story: n.articleTitle === null ? null : { id: n.articleId, slug: openable ? row.slug : null, title: n.articleTitle },
      count: row.groupCount,
      reason: n.reason,
      // A message's text never shows in the bell (owner 2026-09-30); a reminder's note is only which one it is.
      note: n.type === "message" || n.type === "press_meet_reminder" ? null : n.note,
      reports: n.reports,
      reasons: n.reasons,
      conversation: row.chatId && row.chatKind ? { id: row.chatId, kind: row.chatKind, name: row.chatName ?? "", request: row.chatStatus === "request" } : null,
      invite: n.inviteId && row.inviteStatus ? { id: n.inviteId, status: row.inviteStatus } : null,
      pressMeet:
        n.pressMeetId && row.meetTitle && row.meetStartsAt && row.meetPlatform
          ? {
              id: n.pressMeetId,
              title: row.meetTitle,
              startsAt: row.meetStartsAt.toISOString(),
              platform: row.meetPlatform,
              soon: n.type === "press_meet_reminder" && n.note === "soon",
            }
          : null,
      amount: n.amount,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    };
  });
  return { items, unread: await countUnreadNotifications(userId), nextCursor: page.nextCursor };
}

/** Marks the given notifications (all of them when `ids` is omitted) as read. Returns the new unread count. */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const conditions = [eq(notification.userId, userId), isNull(notification.readAt)];
  if (ids && ids.length > 0) conditions.push(inArray(notification.id, ids));
  await db.update(notification).set({ readAt: new Date() }).where(and(...conditions));
  return countUnreadNotifications(userId);
}

const NOTES_PER_STORY = 5;

/**
 * The author's stories that readers reported (every report, open or already handled by the desk), most recently
 * reported first — with the reasons, a few notes and whether the story is hidden / locked.
 */
export async function listReportedStories(authorId: string): Promise<ReportedStoriesResponse> {
  const stories = await db
    .select({
      id: article.id,
      slug: article.slug,
      status: article.status,
      title: article.title,
      coverUrl: article.coverUrl,
      coverBlur: article.coverBlur,
      hiddenAt: article.hiddenAt,
      hiddenReason: article.hiddenReason,
      lockedAt: article.reportLockedAt,
      reports: sql<number>`count(${articleFlag.id})::int`,
      lastReportedAt: sql<string>`max(${articleFlag.createdAt})`,
      notes: sql<string[] | null>`(array_agg(${articleFlag.note} order by ${articleFlag.createdAt} desc) filter (where ${articleFlag.note} is not null))[1:${sql.raw(String(NOTES_PER_STORY))}]`,
    })
    .from(article)
    .innerJoin(articleFlag, eq(articleFlag.articleId, article.id))
    .where(eq(article.authorId, authorId))
    .groupBy(article.id)
    .orderBy(desc(sql`max(${articleFlag.createdAt})`))
    .limit(50);
  if (stories.length === 0) return { items: [] };

  const reasonRows = await db
    .select({ articleId: articleFlag.articleId, reason: articleFlag.reason, count: sql<number>`count(*)::int` })
    .from(articleFlag)
    .where(inArray(articleFlag.articleId, stories.map((s) => s.id)))
    .groupBy(articleFlag.articleId, articleFlag.reason);
  const reasonsOf = new Map<string, ReasonCount[]>();
  for (const row of reasonRows) {
    const list = reasonsOf.get(row.articleId) ?? [];
    list.push({ reason: row.reason, count: row.count });
    reasonsOf.set(row.articleId, list);
  }

  const items: ReportedStory[] = stories.map((s) => ({
    id: s.id,
    slug: s.status === "published" ? s.slug : null,
    title: s.title ?? "Untitled story",
    coverUrl: s.coverUrl,
    coverBlur: s.coverBlur,
    hidden: s.hiddenAt !== null,
    locked: s.lockedAt !== null,
    hiddenReason: s.hiddenReason,
    reports: s.reports,
    reasons: (reasonsOf.get(s.id) ?? []).sort((a, b) => b.count - a.count),
    notes: s.notes ?? [],
    lastReportedAt: new Date(s.lastReportedAt).toISOString(),
  }));
  return { items };
}
