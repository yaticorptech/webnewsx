import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { article, articleComment, articleCommentLike, user } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import { publishEvent } from "../lib/events.js";
import { notifyCommented } from "./notifications.js";
import { toReporterLevel } from "../lib/roles.js";
import { extractMentions, type ArticleComment, type CommentLikeResult, type Page, type Role } from "../shared/contracts.js";
import { visibleWhere } from "./articles.js";
import { badgeLevelSql, beforeCursor, isUuid } from "./shared.js";

/** Who is looking (null = signed out): decides `liked` and `canDelete`. */
export type CommentViewer = { id: string; role: Role } | null;

/** Replies under one comment are listed in full (oldest first) up to this many. */
const REPLIES_MAX = 200;

function commentColumns(viewerId: string | null) {
  return {
    id: articleComment.id,
    articleId: articleComment.articleId,
    parentId: articleComment.parentId,
    body: articleComment.body,
    likeCount: articleComment.likeCount,
    createdAt: articleComment.createdAt,
    authorId: user.id,
    username: user.username,
    name: user.name,
    image: user.image,
    reporterLevel: badgeLevelSql,
    replyCount: sql<number>`(select count(*)::int from article_comment r where r.parent_id = ${articleComment.id})`,
    liked: viewerId
      ? sql<boolean>`exists (select 1 from ${articleCommentLike} l where l.comment_id = ${articleComment.id} and l.user_id = ${viewerId})`
      : sql<boolean>`false`,
  };
}

type CommentRow = {
  id: string;
  articleId: string;
  parentId: string | null;
  body: string;
  likeCount: number;
  createdAt: Date;
  authorId: string;
  username: string | null;
  name: string;
  image: string | null;
  reporterLevel: string | null;
  replyCount: number;
  liked: boolean;
};

/** The comment's author, the story's author and the Editor Desk may delete it. */
const mayDelete = (viewer: CommentViewer, commentAuthorId: string, storyAuthorId: string) =>
  viewer !== null && (viewer.id === commentAuthorId || viewer.id === storyAuthorId || viewer.role === "admin");

/** Of the @usernames in these comments, the ones that belong to real (onboarded, active) accounts. */
async function existingMentions(rows: CommentRow[], executor: Executor = db): Promise<Set<string>> {
  const wanted = [...new Set(rows.flatMap((row) => extractMentions(row.body)))];
  if (wanted.length === 0) return new Set();
  const found = await executor
    .select({ username: user.username })
    .from(user)
    .where(and(inArray(user.username, wanted), isNull(user.suspendedAt)));
  return new Set(found.map((f) => f.username).filter((u): u is string => Boolean(u)));
}

function toComment(row: CommentRow, viewer: CommentViewer, storyAuthorId: string, known: Set<string>): ArticleComment {
  return {
    id: row.id,
    articleId: row.articleId,
    parentId: row.parentId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.authorId, username: row.username ?? "", name: row.name, image: row.image, reporterLevel: toReporterLevel(row.reporterLevel) },
    likeCount: row.likeCount,
    liked: Boolean(row.liked),
    replyCount: Number(row.replyCount),
    mentions: extractMentions(row.body).filter((username) => known.has(username)),
    canDelete: mayDelete(viewer, row.authorId, storyAuthorId),
  };
}

/** Author of a publicly visible story, or null. */
async function visibleStoryAuthor(articleId: string, executor: Executor = db): Promise<string | null> {
  if (!isUuid(articleId)) return null;
  const [row] = await executor
    .select({ authorId: article.authorId })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(eq(article.id, articleId), visibleWhere()))
    .limit(1);
  return row?.authorId ?? null;
}

async function toComments(rows: CommentRow[], viewer: CommentViewer, storyAuthorId: string): Promise<ArticleComment[]> {
  const known = await existingMentions(rows);
  return rows.map((row) => toComment(row, viewer, storyAuthorId, known));
}

/**
 * Top-level comments on a visible story, newest first (null = story not visible). Comments by suspended
 * accounts are left out.
 */
export async function listComments(
  articleId: string,
  viewer: CommentViewer,
  cursorRaw: string | undefined,
  limit: number,
): Promise<Page<ArticleComment> | null> {
  const storyAuthorId = await visibleStoryAuthor(articleId);
  if (!storyAuthorId) return null;
  const cursor = decodeCursor(cursorRaw);
  const conditions: SQL[] = [eq(articleComment.articleId, articleId), isNull(articleComment.parentId), sql`${user.suspendedAt} is null`];
  if (cursor) conditions.push(beforeCursor(articleComment.createdAt, articleComment.id, cursor, "uuid"));
  const rows = await db
    .select(commentColumns(viewer?.id ?? null))
    .from(articleComment)
    .innerJoin(user, eq(user.id, articleComment.authorId))
    .where(and(...conditions))
    .orderBy(desc(articleComment.createdAt), desc(articleComment.id))
    .limit(limit + 1);
  const page = paginate(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
  return { items: await toComments(page.items, viewer, storyAuthorId), nextCursor: page.nextCursor };
}

/** Replies to one top-level comment, oldest first (null = story not visible or no such comment). */
export async function listReplies(articleId: string, parentId: string, viewer: CommentViewer): Promise<ArticleComment[] | null> {
  if (!isUuid(parentId)) return null;
  const storyAuthorId = await visibleStoryAuthor(articleId);
  if (!storyAuthorId) return null;
  const rows = await db
    .select(commentColumns(viewer?.id ?? null))
    .from(articleComment)
    .innerJoin(user, eq(user.id, articleComment.authorId))
    .where(and(eq(articleComment.articleId, articleId), eq(articleComment.parentId, parentId), sql`${user.suspendedAt} is null`))
    .orderBy(asc(articleComment.createdAt), asc(articleComment.id))
    .limit(REPLIES_MAX);
  return toComments(rows, viewer, storyAuthorId);
}

/**
 * Adds a comment (or a reply) to a visible story: +1 on its counter and a live `article.stats`. A reply to a
 * reply joins the same thread. null = story not visible or the parent isn't a comment on it.
 */
export async function addComment(
  author: { id: string; role: Role },
  articleId: string,
  body: string,
  parentId: string | null = null,
): Promise<{ comment: ArticleComment; commentCount: number } | null> {
  if (!isUuid(articleId) || (parentId !== null && !isUuid(parentId))) return null;
  return db.transaction(async (tx) => {
    const [story] = await tx
      .select({ id: article.id, authorId: article.authorId, title: article.title })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(eq(article.id, articleId), visibleWhere()))
      .for("update", { of: article })
      .limit(1);
    if (!story) return null;
    let threadId: string | null = null;
    if (parentId) {
      const [parent] = await tx
        .select({ id: articleComment.id, parentId: articleComment.parentId })
        .from(articleComment)
        .where(and(eq(articleComment.id, parentId), eq(articleComment.articleId, articleId)))
        .limit(1);
      if (!parent) return null;
      threadId = parent.parentId ?? parent.id;
    }
    const [inserted] = await tx
      .insert(articleComment)
      .values({ articleId, authorId: author.id, body, parentId: threadId })
      .returning({ id: articleComment.id });
    if (!inserted) return null;
    const [counted] = await tx
      .update(article)
      .set({ commentCount: sql`${article.commentCount} + 1` })
      .where(eq(article.id, articleId))
      .returning({ commentCount: article.commentCount });
    await publishEvent(tx, { t: "article.stats", id: articleId });
    await publishEvent(tx, { t: "comments", id: articleId });
    await notifyCommented(tx, story, author.id, body);
    const rows = await tx
      .select(commentColumns(author.id))
      .from(articleComment)
      .innerJoin(user, eq(user.id, articleComment.authorId))
      .where(eq(articleComment.id, inserted.id))
      .limit(1);
    const known = await existingMentions(rows, tx);
    // The story's new count goes back with it (owner 2026-10-05: adding 1 on the page as well as taking the live
    // count could show 2 for 1).
    return rows[0] ? { comment: toComment(rows[0], author, story.authorId, known), commentCount: counted?.commentCount ?? 0 } : null;
  });
}

/**
 * Deletes a comment and its replies (its author, the story's author or the Editor Desk). Returns the story's new
 * comment count; null = not found / not allowed.
 */
export async function deleteComment(viewer: { id: string; role: Role }, articleId: string, commentId: string): Promise<number | null> {
  if (!isUuid(articleId) || !isUuid(commentId)) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ authorId: articleComment.authorId, storyAuthorId: article.authorId })
      .from(articleComment)
      .innerJoin(article, eq(article.id, articleComment.articleId))
      .where(and(eq(articleComment.id, commentId), eq(articleComment.articleId, articleId)))
      .for("update", { of: article })
      .limit(1);
    if (!row || !mayDelete(viewer, row.authorId, row.storyAuthorId)) return null;
    const [{ replies } = { replies: 0 }] = await tx
      .select({ replies: sql<number>`count(*)::int` })
      .from(articleComment)
      .where(and(isNotNull(articleComment.parentId), eq(articleComment.parentId, commentId)));
    await tx.delete(articleComment).where(eq(articleComment.id, commentId));
    const [counted] = await tx
      .update(article)
      .set({ commentCount: sql`greatest(${article.commentCount} - ${1 + Number(replies)}, 0)` })
      .where(eq(article.id, articleId))
      .returning({ commentCount: article.commentCount });
    await publishEvent(tx, { t: "article.stats", id: articleId });
    await publishEvent(tx, { t: "comments", id: articleId });
    return counted?.commentCount ?? 0;
  });
}

/** Likes / unlikes a comment on a visible story (idempotent). null = not found. */
export async function setCommentLike(userId: string, articleId: string, commentId: string, liked: boolean): Promise<CommentLikeResult | null> {
  if (!isUuid(articleId) || !isUuid(commentId)) return null;
  if (!(await visibleStoryAuthor(articleId))) return null;
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ likeCount: articleComment.likeCount })
      .from(articleComment)
      .where(and(eq(articleComment.id, commentId), eq(articleComment.articleId, articleId)))
      .for("update")
      .limit(1);
    if (!target) return null;
    const rows = liked
      ? await tx.insert(articleCommentLike).values({ commentId, userId }).onConflictDoNothing().returning({ id: articleCommentLike.commentId })
      : await tx
          .delete(articleCommentLike)
          .where(and(eq(articleCommentLike.commentId, commentId), eq(articleCommentLike.userId, userId)))
          .returning({ id: articleCommentLike.commentId });
    if (rows.length === 0) return { liked, likeCount: target.likeCount };
    const [updated] = await tx
      .update(articleComment)
      .set({ likeCount: liked ? sql`${articleComment.likeCount} + 1` : sql`greatest(${articleComment.likeCount} - 1, 0)` })
      .where(eq(articleComment.id, commentId))
      .returning({ likeCount: articleComment.likeCount });
    return { liked, likeCount: updated?.likeCount ?? target.likeCount };
  });
}
