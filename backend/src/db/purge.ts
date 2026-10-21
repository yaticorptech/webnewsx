import { and, eq, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { publishEvent } from "../lib/events.js";
import { UPLOAD_FOLDERS, deleteQuietly, storage } from "../lib/storage.js";
import { db } from "./client.js";
import {
  adminAuditLog,
  article,
  articleComment,
  articleCommentLike,
  articleLike,
  articleRead,
  articleView,
  conversationMember,
  spotlightOrder,
  user,
} from "./schema.js";

/** Email domain of seeded demo accounts (`npm run db:seed`). */
export const DEMO_EMAIL_DOMAIN = "demo.webnews.local";
/** Email domain of automated-test fixtures (backend vitest + Playwright e2e). */
export const TEST_EMAIL_DOMAIN = "test.webnews.local";

export type GeneratedDomain = typeof DEMO_EMAIL_DOMAIN | typeof TEST_EMAIL_DOMAIN;

export type PurgeTarget =
  /** Exactly these user ids (each must still belong to a generated domain). */
  | { ids: string[] }
  /** Every user whose email ends with one of these generated domains. */
  | { emailDomains: GeneratedDomain[] }
  /**
   * Every TEST user whose email starts with this local-part prefix, e.g. "e2e.qxkzvb." → one e2e run's
   * fixtures ("e2e.qxkzvb.<random>@test.webnews.local"). Letters and dots only, ≥ 4 chars.
   */
  | { testEmailPrefix: string };

export type PurgeResult = { users: number; articles: number };

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const emailInDomain = (domain: GeneratedDomain): SQL => sql`lower(${user.email}) like ${`%@${domain}`}`;

/** Hard safety net: whatever the target, only generated (demo/test) accounts can ever match. */
const generatedOnly = (): SQL => or(emailInDomain(DEMO_EMAIL_DOMAIN), emailInDomain(TEST_EMAIL_DOMAIN)) as SQL;

const SAFE_PREFIX = /^[a-z][a-z.]{3,63}$/;

function targetWhere(target: PurgeTarget): SQL | null {
  if ("ids" in target) return target.ids.length > 0 ? (and(inArray(user.id, target.ids), generatedOnly()) as SQL) : null;
  if ("emailDomains" in target) {
    return target.emailDomains.length > 0 ? (and(or(...target.emailDomains.map(emailInDomain)), generatedOnly()) as SQL) : null;
  }
  // Letters and dots only, so the value can't carry LIKE wildcards (% _) or escapes.
  if (!SAFE_PREFIX.test(target.testEmailPrefix)) throw new Error("testEmailPrefix must be 4-64 lowercase letters/dots");
  return and(sql`lower(${user.email}) like ${`${target.testEmailPrefix}%@${TEST_EMAIL_DOMAIN}`}`, generatedOnly()) as SQL;
}

/**
 * Deletes generated users and everything they own (FK cascade), non-destructively for everyone else:
 * - like/view counters on OTHER people's articles are decremented for the removed likes/views;
 * - `article.deleted` / `article.stats` events are queued in the same transaction, so open feeds update live;
 * - their uploaded files are removed after commit (best-effort).
 * Real accounts can never be removed by this function (see `generatedOnly`).
 */
export async function purgeUsers(target: PurgeTarget, options: { extraLocalDirs?: string[] } = {}): Promise<PurgeResult> {
  const where = targetWhere(target);
  if (!where) return { users: 0, articles: 0 };
  const victims = await db.select({ id: user.id, image: user.image }).from(user).where(where);
  return purgeVictims(victims, options.extraLocalDirs ?? []);
}

/**
 * Deletes ONE real account and everything it owns, the same way as `purgeUsers` — the Editor Desk's "Delete account"
 * (owner 2026-10-01, admin-people.ts `deleteAccount`, which guards who may be deleted). No generated-domain net here.
 */
export async function purgeAccount(userId: string): Promise<PurgeResult> {
  const victims = await db.select({ id: user.id, image: user.image }).from(user).where(eq(user.id, userId));
  return purgeVictims(victims, []);
}

async function purgeVictims(victims: Array<{ id: string; image: string | null }>, extraLocalDirs: string[]): Promise<PurgeResult> {
  if (victims.length === 0) return { users: 0, articles: 0 };
  const ids = victims.map((v) => v.id);

  const owned = await db
    .select({ id: article.id, status: article.status, coverKey: article.coverKey, videoKey: article.videoKey })
    .from(article)
    .where(inArray(article.authorId, ids));

  await db.transaction(async (tx) => {
    const touched = new Set<string>();

    // Likes these users left on articles that survive → decrement those counters.
    const likes = await tx
      .select({ articleId: articleLike.articleId, n: sql<number>`count(*)::int` })
      .from(articleLike)
      .innerJoin(article, eq(article.id, articleLike.articleId))
      .where(and(inArray(articleLike.userId, ids), notInArray(article.authorId, ids)))
      .groupBy(articleLike.articleId);
    for (const { articleId, n } of likes) {
      await tx
        .update(article)
        .set({ likeCount: sql`greatest(${article.likeCount} - ${n}, 0)` })
        .where(eq(article.id, articleId));
      touched.add(articleId);
    }

    // Signed-in views (`u:<id>` keys are not a foreign key) → remove + decrement.
    const viewKeys = ids.map((id) => `u:${id}`);
    const views = await tx
      .delete(articleView)
      .where(inArray(articleView.viewerKey, viewKeys))
      .returning({ articleId: articleView.articleId });
    const ownedIds = new Set(owned.map((a) => a.id));
    const viewCounts = new Map<string, number>();
    for (const { articleId } of views) {
      if (!ownedIds.has(articleId)) viewCounts.set(articleId, (viewCounts.get(articleId) ?? 0) + 1);
    }
    for (const [articleId, n] of viewCounts) {
      await tx
        .update(article)
        .set({ viewCount: sql`greatest(${article.viewCount} - ${n}, 0)` })
        .where(eq(article.id, articleId));
      touched.add(articleId);
    }

    // Their reads ("u:<id>" keys, no FK) go too; reads have no counter column.
    await tx.delete(articleRead).where(inArray(articleRead.viewerKey, viewKeys));

    // Their comments on articles that survive — and the replies under them, which go with them — → decrement those
    // articles' comment counters. Their likes on surviving comments → decrement those comments' like counters.
    const theirComments = tx.select({ id: articleComment.id }).from(articleComment).where(inArray(articleComment.authorId, ids));
    const comments = await tx
      .select({ articleId: articleComment.articleId, n: sql<number>`count(*)::int` })
      .from(articleComment)
      .innerJoin(article, eq(article.id, articleComment.articleId))
      .where(
        and(
          notInArray(article.authorId, ids),
          or(inArray(articleComment.authorId, ids), inArray(articleComment.parentId, theirComments)),
        ),
      )
      .groupBy(articleComment.articleId);
    for (const { articleId, n } of comments) {
      await tx
        .update(article)
        .set({ commentCount: sql`greatest(${article.commentCount} - ${n}, 0)` })
        .where(eq(article.id, articleId));
      touched.add(articleId);
    }
    const commentLikes = await tx
      .select({ commentId: articleCommentLike.commentId, n: sql<number>`count(*)::int` })
      .from(articleCommentLike)
      .innerJoin(articleComment, eq(articleComment.id, articleCommentLike.commentId))
      .where(and(inArray(articleCommentLike.userId, ids), notInArray(articleComment.authorId, ids)))
      .groupBy(articleCommentLike.commentId);
    for (const { commentId, n } of commentLikes) {
      await tx
        .update(articleComment)
        .set({ likeCount: sql`greatest(${articleComment.likeCount} - ${n}, 0)` })
        .where(eq(articleComment.id, commentId));
    }

    for (const a of owned) if (a.status === "published") await publishEvent(tx, { t: "article.deleted", id: a.id });
    for (const id of touched) await publishEvent(tx, { t: "article.stats", id });

    // Editor Desk audit entries made by these users or about them, their stories or their Spotlight orders
    // (otherwise they'd linger in the console as orphaned "system" entries).
    const orders = await tx.select({ id: spotlightOrder.id }).from(spotlightOrder).where(inArray(spotlightOrder.reporterId, ids));
    const aboutThem: SQL[] = [
      inArray(adminAuditLog.actorId, ids),
      and(inArray(adminAuditLog.targetType, ["user", "press_pass"]), inArray(adminAuditLog.targetId, ids)) as SQL,
    ];
    if (owned.length > 0) {
      aboutThem.push(and(eq(adminAuditLog.targetType, "article"), inArray(adminAuditLog.targetId, [...ownedIds])) as SQL);
    }
    if (orders.length > 0) {
      aboutThem.push(and(eq(adminAuditLog.targetType, "spotlight_order"), inArray(adminAuditLog.targetId, orders.map((o) => o.id))) as SQL);
    }
    await tx.delete(adminAuditLog).where(or(...aboutThem));

    // Their chats: remembered so the ones nobody is left in go too.
    const chats = await tx
      .select({ id: conversationMember.conversationId })
      .from(conversationMember)
      .where(inArray(conversationMember.userId, ids));

    // Cascades: articles, likes, follows, sessions, accounts, press passes, saves, flags, Spotlight orders, chat memberships.
    await tx.delete(user).where(inArray(user.id, ids));

    if (chats.length > 0) {
      await tx.execute(sql`
        delete from conversation c
        where c.id in (${sql.join([...new Set(chats.map((chat) => chat.id))].map((id) => sql`${id}::uuid`), sql`, `)})
          and not exists (select 1 from conversation_member m where m.conversation_id = c.id)
      `);
    }
  });

  await removeFiles(victims, owned, extraLocalDirs);
  return { users: victims.length, articles: owned.length };
}

async function removeFiles(
  victims: Array<{ id: string; image: string | null }>,
  owned: Array<{ coverKey: string | null; videoKey: string | null }>,
  extraLocalDirs: string[],
): Promise<void> {
  // Referenced objects (works for R2 and local).
  const keys = new Set<string>();
  for (const v of victims) {
    const key = v.image ? storage.keyFromUrl(v.image) : null;
    if (key) keys.add(key);
  }
  for (const a of owned) {
    if (a.coverKey) keys.add(a.coverKey);
    if (a.videoKey) keys.add(a.videoKey);
  }
  for (const key of keys) await deleteQuietly(key);

  // Then the whole per-user folders (uploads that were never saved anywhere), on R2 as well as on disk.
  for (const { id } of victims) {
    if (!SAFE_ID.test(id)) continue;
    for (const folder of UPLOAD_FOLDERS) {
      try {
        await storage.deletePrefix(`${folder}/${id}/`);
      } catch (error) {
        console.warn(`[storage] could not remove ${folder}/${id}/:`, error instanceof Error ? error.message : error);
      }
      for (const root of extraLocalDirs) await rm(join(root, folder, id), { recursive: true, force: true });
    }
  }
}
