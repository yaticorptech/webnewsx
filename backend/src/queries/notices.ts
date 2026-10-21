import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { article, userNotice } from "../db/schema.js";
import type { NoticeKind, NoticesResponse, UserNotice } from "../shared/contracts.js";

/*
 * Notices from the Editor Desk to a reporter (owner rule 2026-09-25): a warning about a reported story, or one of
 * their stories hidden. The reporter sees unread ones as a banner on every page and all of them in the Newsroom.
 */

export async function createNotice(
  executor: Executor,
  notice: { userId: string; kind: NoticeKind; articleId: string | null; articleTitle: string | null; message: string | null; createdBy: string | null },
): Promise<void> {
  await executor.insert(userNotice).values({ ...notice, message: notice.message?.trim() || null });
}

export async function countUnreadNotices(userId: string, executor: Executor = db): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(userNotice)
    .where(and(eq(userNotice.userId, userId), isNull(userNotice.readAt)));
  return row?.n ?? 0;
}

/** The newest notices (unread first is left to the UI: they're few). */
export async function listNotices(userId: string, limit = 50): Promise<NoticesResponse> {
  const rows = await db
    .select({ notice: userNotice, slug: article.slug, status: article.status })
    .from(userNotice)
    .leftJoin(article, eq(article.id, userNotice.articleId))
    .where(eq(userNotice.userId, userId))
    .orderBy(desc(userNotice.createdAt))
    .limit(limit);
  const items: UserNotice[] = rows.map(({ notice, slug, status }) => ({
    id: notice.id,
    kind: notice.kind,
    message: notice.message,
    story:
      notice.articleId || notice.articleTitle
        ? // Published (hidden ones too — their author can still open them) → linkable; drafts / deleted → title only.
          { id: notice.articleId, slug: status === "published" ? slug : null, title: notice.articleTitle }
        : null,
    // No sender = the automatic report rules (or, rarely, an editor account deleted since).
    automatic: notice.createdBy === null,
    createdAt: notice.createdAt.toISOString(),
    read: notice.readAt !== null,
  }));
  return { items, unread: await countUnreadNotices(userId) };
}

/** Marks the given notices (all of them when `ids` is omitted) as read. Returns the new unread count. */
export async function markNoticesRead(userId: string, ids?: string[]): Promise<number> {
  const conditions = [eq(userNotice.userId, userId), isNull(userNotice.readAt)];
  if (ids && ids.length > 0) conditions.push(inArray(userNotice.id, ids));
  await db.update(userNotice).set({ readAt: new Date() }).where(and(...conditions));
  return countUnreadNotices(userId);
}
