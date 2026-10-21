import { and, eq, gt, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, articleAnonLike, articleLike, articleRead, articleSave, articleShare, articleView, follow, user, articleDislike } from "../db/schema.js";
import { notifyFollowed, notifyLiked } from "./notifications.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import { publishEvent } from "../lib/events.js";
import type { ArticleCard, Page, ShareChannel } from "../shared/contracts.js";
import { findVisibleAuthor, listVisibleCardsByIds, visibleWhere } from "./articles.js";
import { beforeCursor, isUuid } from "./shared.js";
import { followerCount } from "./users.js";

/* ─────────────── Likes ─────────────── */

/** Who likes: an account, or a logged-out visitor by their signed anonymous id (owner 2026-09-28: anyone can like). */
export type Liker = { kind: "user"; id: string } | { kind: "anon"; id: string };

/**
 * Like / unlike a published article. The counter moves only when the row actually changed,
 * in the same transaction, and an `article.stats` event is queued for commit.
 * Returns null when the article does not exist or is not published.
 */
export async function setLike(liker: Liker, articleId: string, liked: boolean): Promise<{ liked: boolean; likeCount: number } | null> {
  if (!isUuid(articleId)) return null;
  return db.transaction(async (tx) => {
    // Lock the article row so concurrent like/unlike updates serialize cleanly.
    const [target] = await tx
      .select({ id: article.id, likeCount: article.likeCount, authorId: article.authorId, title: article.title })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(eq(article.id, articleId), visibleWhere()))
      .for("update", { of: article })
      .limit(1);
    if (!target) return null;

    const rows =
      liker.kind === "user"
        ? liked
          ? await tx.insert(articleLike).values({ userId: liker.id, articleId }).onConflictDoNothing().returning({ articleId: articleLike.articleId })
          : await tx
              .delete(articleLike)
              .where(and(eq(articleLike.userId, liker.id), eq(articleLike.articleId, articleId)))
              .returning({ articleId: articleLike.articleId })
        : liked
          ? await tx
              .insert(articleAnonLike)
              .values({ viewerId: liker.id, articleId })
              .onConflictDoNothing()
              .returning({ articleId: articleAnonLike.articleId })
          : await tx
              .delete(articleAnonLike)
              .where(and(eq(articleAnonLike.viewerId, liker.id), eq(articleAnonLike.articleId, articleId)))
              .returning({ articleId: articleAnonLike.articleId });
    const changed = rows.length > 0;

    if (!changed) return { liked, likeCount: target.likeCount };
    const [updated] = await tx
      .update(article)
      .set({ likeCount: liked ? sql`${article.likeCount} + 1` : sql`greatest(${article.likeCount} - 1, 0)` })
      .where(eq(article.id, articleId))
      .returning({ likeCount: article.likeCount });
    await publishEvent(tx, { t: "article.stats", id: articleId });
    if (liked) await notifyLiked(tx, target, liker.kind === "user" ? liker.id : null);
    return { liked, likeCount: updated?.likeCount ?? target.likeCount };
  });
}

/**
 * 👎 a story (owner 2026-10-16) — one per viewer (`u:<id>` / `a:<id>`). The counter moves only when the row changed.
 * The route takes the viewer's like back first (a dislike replaces a like, and a like replaces a dislike).
 */
export async function setDislike(viewerKey: string, articleId: string, disliked: boolean): Promise<{ disliked: boolean; dislikeCount: number } | null> {
  if (!isUuid(articleId)) return null;
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: article.id, dislikeCount: article.dislikeCount })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(eq(article.id, articleId), visibleWhere()))
      .for("update", { of: article })
      .limit(1);
    if (!target) return null;
    const rows = disliked
      ? await tx.insert(articleDislike).values({ articleId, viewerKey }).onConflictDoNothing().returning({ articleId: articleDislike.articleId })
      : await tx
          .delete(articleDislike)
          .where(and(eq(articleDislike.articleId, articleId), eq(articleDislike.viewerKey, viewerKey)))
          .returning({ articleId: articleDislike.articleId });
    if (rows.length === 0) return { disliked, dislikeCount: target.dislikeCount };
    const [updated] = await tx
      .update(article)
      .set({ dislikeCount: disliked ? sql`${article.dislikeCount} + 1` : sql`greatest(${article.dislikeCount} - 1, 0)` })
      .where(eq(article.id, articleId))
      .returning({ dislikeCount: article.dislikeCount });
    return { disliked, dislikeCount: updated?.dislikeCount ?? target.dislikeCount };
  });
}

/** Does this viewer dislike the story? */
export async function hasDisliked(viewerKey: string | null, articleId: string): Promise<boolean> {
  if (!viewerKey || !isUuid(articleId)) return false;
  const rows = await db
    .select({ articleId: articleDislike.articleId })
    .from(articleDislike)
    .where(and(eq(articleDislike.articleId, articleId), eq(articleDislike.viewerKey, viewerKey)))
    .limit(1);
  return rows.length > 0;
}

/* ─────────────── Shares ─────────────── */

/** A viewer's repeated shares of one story count once per this window (ranking + analytics can't be pumped). */
export const SHARE_DEDUPE_MS = 24 * 60 * 60 * 1000;

/**
 * Records a share: +1 on the live counter and a timestamped share event (Newsroom analytics, Trending) —
 * at most once per viewer per story per 24 h. `viewerKey` null (an anonymous visitor we couldn't issue an
 * id to) is never counted. Returns the current count either way, or null when the story isn't visible.
 */
export async function recordShare(articleId: string, channel: ShareChannel, viewerKey: string | null): Promise<{ shareCount: number; counted: boolean } | null> {
  if (!isUuid(articleId)) return null;
  return db.transaction(async (tx) => {
    // Row lock: concurrent shares by the same viewer serialize, so the dedupe check below can't be raced.
    const [target] = await tx
      .select({ id: article.id, shareCount: article.shareCount })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(eq(article.id, articleId), visibleWhere()))
      .for("update", { of: article })
      .limit(1);
    if (!target) return null;
    if (!viewerKey) return { shareCount: target.shareCount, counted: false };

    const since = new Date(Date.now() - SHARE_DEDUPE_MS);
    const [recent] = await tx
      .select({ id: articleShare.id })
      .from(articleShare)
      .where(and(eq(articleShare.articleId, articleId), eq(articleShare.viewerKey, viewerKey), gt(articleShare.createdAt, since)))
      .limit(1);
    if (recent) return { shareCount: target.shareCount, counted: false };

    const [updated] = await tx
      .update(article)
      .set({ shareCount: sql`${article.shareCount} + 1` })
      .where(eq(article.id, articleId))
      .returning({ shareCount: article.shareCount });
    await tx.insert(articleShare).values({ articleId, channel, viewerKey });
    await publishEvent(tx, { t: "article.stats", id: articleId });
    return { shareCount: updated?.shareCount ?? target.shareCount + 1, counted: true };
  });
}

/* ─────────────── Views ─────────────── */

/**
 * Records unique views for `viewerKey` (`u:<userId>` / `a:<uuid>`). Missing, unpublished and
 * self-authored articles are ignored. Returns the ids whose view count went up.
 */
export async function recordViews(ids: string[], viewerKey: string, viewerUserId: string | null): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return db.transaction(async (tx) => {
    const eligibleConditions: SQL[] = [inArray(article.id, unique), visibleWhere()];
    if (viewerUserId) eligibleConditions.push(ne(article.authorId, viewerUserId));
    // KEY SHARE: a story deleted at this moment waits for us (instead of failing our article_view FK insert),
    // while concurrent view batches and like/view counter updates on the same row still proceed.
    const eligible = await tx
      .select({ id: article.id })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(...eligibleConditions))
      .for("key share", { of: article });
    if (eligible.length === 0) return [];

    // Spotlight impressions (owner 2026-10-16): every visit that showed a running Spotlight counts, even after the
    // reader's first view (the per-reader cap and the reporter's results read them).
    await tx.execute(sql`
      insert into spotlight_impression (order_id, viewer_key)
      select so.id, ${viewerKey} from spotlight_order so
      where so.article_id in (${sql.join(
        eligible.map((row) => sql`${row.id}::uuid`),
        sql`, `,
      )}) and so.status = 'granted' and so.starts_at <= now() and so.ends_at > now()
      on conflict (order_id, viewer_key) do update set shows = spotlight_impression.shows + 1, last_at = now()
    `);

    const inserted = await tx
      .insert(articleView)
      .values(eligible.map((row) => ({ articleId: row.id, viewerKey })))
      .onConflictDoNothing()
      .returning({ articleId: articleView.articleId });
    const counted = inserted.map((row) => row.articleId);
    if (counted.length === 0) return [];

    await tx
      .update(article)
      .set({ viewCount: sql`${article.viewCount} + 1` })
      .where(inArray(article.id, counted));
    for (const id of counted) await publishEvent(tx, { t: "article.stats", id });
    return counted;
  });
}

/* ─────────────── Follows ─────────────── */

export async function setFollow(followerId: string, followingId: string, following: boolean): Promise<{ following: boolean; followerCount: number }> {
  return db.transaction(async (tx) => {
    if (following) {
      const added = await tx.insert(follow).values({ followerId, followingId }).onConflictDoNothing().returning({ followerId: follow.followerId });
      if (added.length > 0) await notifyFollowed(tx, followingId, followerId);
    } else {
      await tx.delete(follow).where(and(eq(follow.followerId, followerId), eq(follow.followingId, followingId)));
    }
    return { following, followerCount: await followerCount(followingId, tx) };
  });
}

/* ─────────────── Reads (article page opens) ─────────────── */

/**
 * Records one "read" (the article page was actually opened — the client posts it when the page mounts, never a
 * prefetch) per viewer per story for Newsroom analytics. Authors reading their own story and hidden / unpublished
 * stories don't count. Returns null when the story isn't visible, else whether a new read was stored.
 */
export async function recordRead(articleId: string, viewerKey: string | null, viewerUserId: string | null): Promise<{ counted: boolean } | null> {
  const authorId = await findVisibleAuthor(articleId);
  if (!authorId) return null;
  if (!viewerKey || viewerUserId === authorId) return { counted: false };
  const inserted = await db.insert(articleRead).values({ articleId, viewerKey }).onConflictDoNothing().returning({ articleId: articleRead.articleId });
  return { counted: inserted.length > 0 };
}

/* ─────────────── Saves ("Save for later") ─────────────── */

/** Save / unsave a visible story (idempotent). Null when the story isn't visible. Unsaving always works. */
export async function setSave(userId: string, articleId: string, saved: boolean): Promise<{ saved: boolean } | null> {
  if (!isUuid(articleId)) return null;
  if (saved) {
    if (!(await findVisibleAuthor(articleId))) return null;
    await db.insert(articleSave).values({ userId, articleId }).onConflictDoNothing();
    return { saved: true };
  }
  await db.delete(articleSave).where(and(eq(articleSave.userId, userId), eq(articleSave.articleId, articleId)));
  return { saved: false };
}

/** The viewer's saved stories, most recently saved first (only ones still visible). */
export async function listSaved(opts: { userId: string; cursor: string | undefined; limit: number }): Promise<Page<ArticleCard>> {
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [eq(articleSave.userId, opts.userId)];
  if (cursor) conditions.push(beforeCursor(articleSave.createdAt, articleSave.articleId, cursor, "uuid"));
  const rows = await db
    .select({ articleId: articleSave.articleId, savedAt: articleSave.createdAt })
    .from(articleSave)
    .innerJoin(article, eq(article.id, articleSave.articleId))
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(...conditions, visibleWhere()))
    .orderBy(sql`${articleSave.createdAt} desc, ${articleSave.articleId} desc`)
    .limit(opts.limit + 1);
  const page = paginate(rows, opts.limit, (row) => ({ at: row.savedAt, id: row.articleId }));
  return { items: await listVisibleCardsByIds(page.items.map((row) => row.articleId), opts.userId), nextCursor: page.nextCursor };
}
