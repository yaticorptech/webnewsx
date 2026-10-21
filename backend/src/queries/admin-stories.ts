import { and, asc, eq, ilike, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "../db/client.js";
import { article, articleFlag, pressPass, spotlightOrder, user, type ArticleRecord } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError, notFound } from "../lib/errors.js";
import { publishEvent } from "../lib/events.js";
import { toReporterLevel } from "../lib/roles.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../lib/slug.js";
import {
  DEFAULT_CATEGORY,
  DEFAULT_POSTER_TEMPLATE,
  TRAINEE_APPROVALS_TO_VERIFY,
  type AdminStoryDetail,
  type AuditEntry,
  type AdminStoryRow,
  type Category,
  type Page,
  type ReporterType,
  type StoryStatus,
} from "../shared/contracts.js";
import { deleteMediaIfUnused } from "./article-write.js";
import { storyStatus, toPosterFrame } from "./articles.js";
import { createNotice } from "./notices.js";
import { notifyFollowers, notifyReturned } from "./notifications.js";
import { setPassLevel } from "./press-pass.js";
import { isUuid } from "./shared.js";

/** The admin performing an action. */
export type Actor = { id: string };

export const MAX_PINS = 3;

/* ─────────────── Rows ─────────────── */

/** Sort key of the Stories list: newest activity first. */
const sortAt = sql<Date>`coalesce(${article.publishedAt}, ${article.submittedAt}, ${article.updatedAt})`;

function rowColumns() {
  return {
    article,
    authorId: user.id,
    username: user.username,
    name: user.name,
    image: user.image,
    role: user.role,
    reporterLevel: user.reporterLevel,
    suspendedAt: user.suspendedAt,
    approvedCount: pressPass.approvedCount,
    reporterType: pressPass.reporterType,
    outlet: pressPass.outlet,
    openFlags: sql<number>`(select count(*)::int from ${articleFlag} f where f.article_id = ${article.id} and f.status = 'open')`,
    spotlight: sql<boolean>`exists (select 1 from ${spotlightOrder} so where so.article_id = ${article.id} and so.status = 'granted' and so.starts_at <= now() and so.ends_at > now())`,
    sortAtMs: sql<number>`(extract(epoch from coalesce(${article.publishedAt}, ${article.submittedAt}, ${article.updatedAt})) * 1000)::float8`,
  };
}

type Row = {
  article: ArticleRecord;
  authorId: string;
  username: string | null;
  name: string;
  image: string | null;
  role: "reader" | "reporter" | "admin";
  reporterLevel: string | null;
  suspendedAt: Date | null;
  approvedCount: number | null;
  reporterType: ReporterType | null;
  outlet: string | null;
  openFlags: number;
  spotlight: boolean;
  sortAtMs: number;
};

function selectRows() {
  return db
    .select(rowColumns())
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .leftJoin(pressPass, eq(pressPass.userId, user.id));
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

function toRow(r: Row): AdminStoryRow {
  const a = r.article;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    coverUrl: a.coverUrl,
    coverBlur: a.coverBlur,
    status: storyStatus(a),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    publishedAt: iso(a.publishedAt),
    submittedAt: iso(a.submittedAt),
    viewCount: a.viewCount,
    likeCount: a.likeCount,
    shareCount: a.shareCount,
    openFlags: Number(r.openFlags),
    editorsPick: a.pinnedAt !== null,
    pinOrder: a.pinnedAt ? a.pinOrder : null,
    spotlight: Boolean(r.spotlight),
    hiddenReason: a.hiddenAt ? a.hiddenReason : null,
    reviewNote: a.reviewNote,
    category: a.category,
    district: a.district,
    template: a.template ?? DEFAULT_POSTER_TEMPLATE,
    posterFrame: toPosterFrame(a),
    author: {
      id: r.authorId,
      username: r.username ?? "",
      name: r.name,
      image: r.image,
      role: r.role,
      reporterLevel: toReporterLevel(r.reporterLevel),
      approvedCount: r.approvedCount,
      reporterType: r.reporterType,
      outlet: r.reporterType === "citizen" ? null : r.outlet,
      suspended: r.suspendedAt !== null,
    },
  };
}

function toDetail(r: Row): AdminStoryDetail {
  const a = r.article;
  return {
    ...toRow(r),
    bodyHtml: a.bodyHtml,
    linkUrl: a.linkUrl,
    linkDomain: a.linkDomain,
    readingMinutes: a.readingMinutes,
    coverWidth: a.coverWidth,
    coverHeight: a.coverHeight,
    videoUrl: a.videoUrl,
    articleImageUrl: a.articleImageUrl,
    articleImageBlur: a.articleImageBlur,
    articleVideoUrl: a.articleImageUrl ? a.articleVideoUrl : null,
  };
}

const STATUS_WHERE: Record<StoryStatus, SQL> = {
  published: and(eq(article.status, "published"), isNull(article.hiddenAt)) as SQL,
  hidden: and(eq(article.status, "published"), isNotNull(article.hiddenAt)) as SQL,
  in_review: eq(article.status, "in_review"),
  returned: and(eq(article.status, "draft"), isNotNull(article.returnedAt)) as SQL,
  draft: and(eq(article.status, "draft"), isNull(article.returnedAt)) as SQL,
};

export type StoryFilters = {
  status: StoryStatus | "all";
  q?: string | undefined;
  reporter?: string | undefined;
  category?: Category | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor: string | undefined;
  limit: number;
};

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/**
 * Every story for the Editor Desk. `all` covers published, hidden, in-review and returned stories;
 * private drafts (never submitted) appear only with `status=draft`.
 */
export async function listAdminStories(filters: StoryFilters): Promise<Page<AdminStoryRow>> {
  const cursor = decodeCursor(filters.cursor);
  const conditions: SQL[] = [
    filters.status === "all" ? (sql`not (${STATUS_WHERE.draft})` as SQL) : STATUS_WHERE[filters.status],
  ];
  if (filters.q) conditions.push(ilike(article.title, likePattern(filters.q)));
  if (filters.reporter) conditions.push(eq(user.username, filters.reporter));
  if (filters.category) conditions.push(eq(article.category, filters.category));
  if (filters.from) conditions.push(sql`${sortAt} >= ${filters.from.toISOString()}::timestamptz`);
  if (filters.to) conditions.push(sql`${sortAt} < ${filters.to.toISOString()}::timestamptz`);
  if (cursor) {
    if (!isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    conditions.push(sql`(${sortAt}, ${article.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await selectRows()
    .where(and(...conditions))
    .orderBy(sql`${sortAt} desc, ${article.id} desc`)
    .limit(filters.limit + 1);
  return pageOf(rows, filters.limit);
}

function pageOf(rows: Row[], limit: number): Page<AdminStoryRow> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items: items.map(toRow),
    nextCursor: hasMore && last ? encodeCursor(new Date(Number(last.sortAtMs)), last.article.id) : null,
  };
}

/** Review Desk queue: Trainee stories waiting for approval, oldest submission first. */
export async function listReviewQueue(opts: { cursor: string | undefined; limit: number }): Promise<Page<AdminStoryRow>> {
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [eq(article.status, "in_review")];
  if (cursor) {
    if (!isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    conditions.push(sql`(${article.submittedAt}, ${article.id}) > (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await selectRows()
    .where(and(...conditions))
    .orderBy(asc(article.submittedAt), asc(article.id))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = items.at(-1);
  return {
    items: items.map(toRow),
    nextCursor: hasMore && last?.article.submittedAt ? encodeCursor(last.article.submittedAt, last.article.id) : null,
  };
}

export async function getAdminStory(id: string): Promise<AdminStoryDetail | null> {
  if (!isUuid(id)) return null;
  const [row] = await selectRows().where(eq(article.id, id)).limit(1);
  return row ? toDetail(row) : null;
}

async function mustRow(id: string): Promise<AdminStoryRow> {
  const story = await getAdminStory(id);
  if (!story) throw notFound("Story not found");
  return story;
}

/** Row lock on one article inside a transaction. */
async function lockArticle(tx: Transaction, id: string): Promise<ArticleRecord> {
  if (!isUuid(id)) throw notFound("Story not found");
  const [row] = await tx.select().from(article).where(eq(article.id, id)).for("update").limit(1);
  if (!row) throw notFound("Story not found");
  return row;
}

const wasVisible = (a: ArticleRecord) => a.status === "published" && a.hiddenAt === null;

/* ─────────────── Review Desk ─────────────── */

/**
 * Approves a Trainee story: it goes live (slug, publishedAt = now, realtime `article.published`), the
 * author's pass counts one more approval, and the 3rd approval upgrades a Trainee to Verified. The story gets its
 * short share code unless it already has one (kept for good, like after an unpublish + re-approval).
 */
export async function approveReview(actor: Actor, id: string, note: string | null): Promise<{ story: AdminStoryRow; autoVerified: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const autoVerified = await db.transaction(async (tx) => {
        const current = await lockArticle(tx, id);
        if (current.status !== "in_review") throw new ApiError(409, "not_in_review", "This story is not waiting for review");
        const now = new Date();
        await tx
          .update(article)
          .set({
            status: "published",
            // Submitted before categories existed (the migration filed those too; belt and braces).
            category: current.category ?? DEFAULT_CATEGORY,
            // The reporter's poster pick stays; stories submitted before templates existed get the default.
            template: current.template ?? DEFAULT_POSTER_TEMPLATE,
            slug: makeSlug(current.title ?? "story"),
            shortCode: current.shortCode ?? makeShortCode(),
            publishedAt: now,
            updatedAt: now,
            reviewedBy: actor.id,
            reviewedAt: now,
            reviewNote: note,
            returnedAt: null,
          })
          .where(eq(article.id, id));

        let upgraded = false;
        const [pass] = await tx
          .update(pressPass)
          .set({ approvedCount: sql`${pressPass.approvedCount} + 1`, updatedAt: now })
          .where(eq(pressPass.userId, current.authorId))
          .returning({ level: pressPass.level, approvedCount: pressPass.approvedCount, revokedAt: pressPass.revokedAt });
        if (pass && !pass.revokedAt && pass.level === "trainee" && pass.approvedCount >= TRAINEE_APPROVALS_TO_VERIFY) {
          await setPassLevel(tx, current.authorId, "verified", false);
          const [author] = await tx.select({ username: user.username }).from(user).where(eq(user.id, current.authorId)).limit(1);
          await writeAudit(tx, {
            actorId: null,
            action: "reporter.auto_verify",
            targetType: "user",
            targetId: current.authorId,
            targetLabel: author?.username ?? null,
            meta: { approvedCount: pass.approvedCount },
          });
          upgraded = true;
        }
        await writeAudit(tx, {
          actorId: actor.id,
          action: "review.approve",
          targetType: "article",
          targetId: id,
          targetLabel: current.title,
          meta: { note },
        });
        await notifyFollowers(tx, id);
        await publishEvent(tx, { t: "article.published", id });
        return upgraded;
      });
      return { story: await mustRow(id), autoVerified };
    } catch (error) {
      if (isLinkCollision(error)) continue;
      throw error;
    }
  }
  throw new ApiError(500, "internal_error", "Could not generate a unique link for this story");
}

/**
 * Returns a Trainee story to its author (back to draft) with the editor's note shown in the composer — and in their
 * notifications (owner 2026-10-01).
 */
export async function returnReview(actor: Actor, id: string, note: string): Promise<AdminStoryRow> {
  await db.transaction(async (tx) => {
    const current = await lockArticle(tx, id);
    if (current.status !== "in_review") throw new ApiError(409, "not_in_review", "This story is not waiting for review");
    const now = new Date();
    await tx
      .update(article)
      .set({ status: "draft", returnedAt: now, reviewNote: note, reviewedBy: actor.id, reviewedAt: now, updatedAt: now })
      .where(eq(article.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "review.return", targetType: "article", targetId: id, targetLabel: current.title, meta: { note } });
    if (current.authorId !== actor.id) await notifyReturned(tx, { id, authorId: current.authorId, title: current.title }, note);
  });
  return mustRow(id);
}

/* ─────────────── Moderation ─────────────── */

async function compactPins(tx: Transaction): Promise<void> {
  const pinned = await tx
    .select({ id: article.id })
    .from(article)
    .where(isNotNull(article.pinnedAt))
    .orderBy(asc(article.pinOrder), asc(article.pinnedAt));
  for (const [i, { id }] of pinned.entries()) await tx.update(article).set({ pinOrder: i + 1 }).where(eq(article.id, id));
}

/** Hides a published story from every public surface (the author still sees it, marked hidden). */
/**
 * Hides a published story whose row the caller holds locked: off every feed (pins compacted, open feeds told).
 * `lock` = hidden by the report rules (REPORT_RULES.hideAfter): it can't be republished.
 */
export async function hideLockedStory(tx: Transaction, story: ArticleRecord, reason: string, lock = false): Promise<void> {
  const now = new Date();
  await tx
    .update(article)
    .set({ hiddenAt: now, hiddenReason: reason, pinnedAt: null, pinOrder: null, ...(lock ? { reportLockedAt: now } : {}) })
    .where(eq(article.id, story.id));
  if (story.pinnedAt) await compactPins(tx);
  await publishEvent(tx, { t: "article.deleted", id: story.id });
}

export async function hideStory(actor: Actor, id: string, reason: string): Promise<AdminStoryRow> {
  await db.transaction(async (tx) => {
    const current = await lockArticle(tx, id);
    if (current.status !== "published") throw new ApiError(409, "not_published", "Only published stories can be hidden");
    if (current.hiddenAt) return;
    await hideLockedStory(tx, current, reason);
    if (current.authorId !== actor.id) {
      await createNotice(tx, { userId: current.authorId, kind: "story_hidden", articleId: id, articleTitle: current.title, message: reason, createdBy: actor.id });
    }
    await writeAudit(tx, { actorId: actor.id, action: "story.hide", targetType: "article", targetId: id, targetLabel: current.title, meta: { reason } });
  });
  return mustRow(id);
}

export async function unhideStory(actor: Actor, id: string): Promise<AdminStoryRow> {
  await db.transaction(async (tx) => {
    const current = await lockArticle(tx, id);
    if (!current.hiddenAt) return;
    // The Editor Desk restoring it also lifts the report lock (REPORT_RULES.hideAfter).
    await tx.update(article).set({ hiddenAt: null, hiddenReason: null, reportLockedAt: null }).where(eq(article.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "story.unhide", targetType: "article", targetId: id, targetLabel: current.title });
  });
  return mustRow(id);
}

/**
 * Takes a published story down to the author's drafts (shown to them as "returned" with the reason). The slug goes, the
 * short code stays: links shared earlier lead to the story again once it is back up.
 */
export async function unpublishStory(actor: Actor, id: string, reason: string | null): Promise<AdminStoryRow> {
  await db.transaction(async (tx) => {
    const current = await lockArticle(tx, id);
    if (current.status !== "published") throw new ApiError(409, "not_published", "Only published stories can be unpublished");
    const now = new Date();
    await tx
      .update(article)
      .set({
        status: "draft",
        slug: null,
        publishedAt: null,
        hiddenAt: null,
        hiddenReason: null,
        pinnedAt: null,
        pinOrder: null,
        returnedAt: now,
        reviewNote: reason ?? "Unpublished by the Editor Desk",
        reviewedBy: actor.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(article.id, id));
    if (current.pinnedAt) await compactPins(tx);
    await writeAudit(tx, { actorId: actor.id, action: "story.unpublish", targetType: "article", targetId: id, targetLabel: current.title, meta: { reason } });
    if (wasVisible(current)) await publishEvent(tx, { t: "article.deleted", id });
  });
  return mustRow(id);
}

/** Permanently deletes any story. */
export async function adminDeleteStory(actor: Actor, id: string, reason: string | null): Promise<void> {
  const mediaKeys = await db.transaction(async (tx) => deleteLockedStory(tx, await lockArticle(tx, id), { actorId: actor.id, reason }));
  await deleteMediaIfUnused(...mediaKeys);
}

/**
 * Deletes a story whose row the transaction holds locked (its likes, saves, reports… cascade), logged in the audit
 * log. `actorId` null + `auto` = the automatic report rules did it (flags.ts). Returns its media keys: delete them
 * after the commit (deleteMediaIfUnused).
 */
export async function deleteLockedStory(
  tx: Transaction,
  current: ArticleRecord,
  opts: { actorId: string | null; reason: string | null; auto?: AuditEntry["meta"] },
): Promise<Array<string | null>> {
  await tx.delete(article).where(eq(article.id, current.id));
  if (current.pinnedAt) await compactPins(tx);
  await writeAudit(tx, {
    actorId: opts.actorId,
    action: opts.auto ? "story.auto_delete" : "story.delete",
    targetType: "article",
    targetId: current.id,
    targetLabel: current.title,
    meta: { reason: opts.reason, authorId: current.authorId, ...opts.auto },
  });
  if (current.status === "published") await publishEvent(tx, { t: "article.deleted", id: current.id });
  return [current.coverKey, current.videoKey, current.articleImageKey, current.articleVideoKey];
}

/* ─────────────── Editor's Picks ─────────────── */

export async function listPins(): Promise<AdminStoryRow[]> {
  const rows = await selectRows()
    .where(isNotNull(article.pinnedAt))
    .orderBy(asc(article.pinOrder), asc(article.pinnedAt));
  return rows.map(toRow);
}

export async function pinStory(actor: Actor, id: string): Promise<AdminStoryRow[]> {
  await db.transaction(async (tx) => {
    // Serialize pin changes so two admins can't both take the last slot.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('webnews:pins'))`);
    const current = await lockArticle(tx, id);
    if (current.pinnedAt) return;
    if (!wasVisible(current)) throw new ApiError(409, "not_published", "Only live stories can be Editor's Picks");
    const [author] = await tx.select({ suspendedAt: user.suspendedAt }).from(user).where(eq(user.id, current.authorId)).limit(1);
    if (author?.suspendedAt) throw new ApiError(409, "author_suspended", "The reporter is suspended");
    const [{ n, maxOrder } = { n: 0, maxOrder: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int`, maxOrder: sql<number>`coalesce(max(${article.pinOrder}), 0)::int` })
      .from(article)
      .where(isNotNull(article.pinnedAt));
    if (n >= MAX_PINS) throw new ApiError(409, "pin_limit", `Unpin a story first — up to ${MAX_PINS} Editor's Picks`);
    await tx.update(article).set({ pinnedAt: new Date(), pinOrder: maxOrder + 1 }).where(eq(article.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "story.pin", targetType: "article", targetId: id, targetLabel: current.title });
  });
  return listPins();
}

export async function unpinStory(actor: Actor, id: string): Promise<AdminStoryRow[]> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('webnews:pins'))`);
    const current = await lockArticle(tx, id);
    if (!current.pinnedAt) return;
    await tx.update(article).set({ pinnedAt: null, pinOrder: null }).where(eq(article.id, id));
    await compactPins(tx);
    await writeAudit(tx, { actorId: actor.id, action: "story.unpin", targetType: "article", targetId: id, targetLabel: current.title });
  });
  return listPins();
}

/** `ids` must be exactly the current picks, in the new order. */
export async function reorderPins(actor: Actor, ids: string[]): Promise<AdminStoryRow[]> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('webnews:pins'))`);
    const pinned = await tx.select({ id: article.id }).from(article).where(isNotNull(article.pinnedAt));
    const current = new Set(pinned.map((p) => p.id));
    if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
      throw new ApiError(400, "invalid_order", "Send every current Editor's Pick exactly once");
    }
    for (const [i, id] of ids.entries()) await tx.update(article).set({ pinOrder: i + 1 }).where(eq(article.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "story.pins_reorder", targetType: "article", targetId: ids[0] ?? "", meta: { order: ids.join(",") } });
  });
  return listPins();
}

/** Stories whose ids are in `ids` and are pinned (helper for suspension). */
export async function unpinAuthorStories(tx: Transaction, authorId: string): Promise<void> {
  const pinned = await tx
    .select({ id: article.id })
    .from(article)
    .where(and(eq(article.authorId, authorId), isNotNull(article.pinnedAt)));
  if (pinned.length === 0) return;
  await tx
    .update(article)
    .set({ pinnedAt: null, pinOrder: null })
    .where(inArray(article.id, pinned.map((p) => p.id)));
  await compactPins(tx);
}
