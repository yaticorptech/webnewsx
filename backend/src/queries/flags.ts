import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db/client.js";
import { article, articleFlag, user } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError, isUniqueViolation, notFound } from "../lib/errors.js";
import {
  FLAG_REASON_LABELS,
  REPORT_RULES,
  type AdminFlag,
  type AdminFlagGroup,
  type FlagReason,
  type FlagResolution,
  type Page,
  type flagSchema,
  type resolveFlagsSchema,
} from "../shared/contracts.js";
import { findVisibleAuthor, storyStatus } from "./articles.js";
import { hideStory, type Actor } from "./admin-stories.js";
import { createNotice } from "./notices.js";
import { notifyReported, notifyWarned } from "./notifications.js";
import { suspendUser } from "./admin-people.js";
import { isUuid } from "./shared.js";

export type FlagData = z.output<typeof flagSchema>;

/**
 * A reader reports a visible story. One open flag per reader per story (409 `already_flagged`). Report rules
 * (REPORT_RULES, owner 2026-09-30): its author is warned right away — the bell (reason + note) and a warning banner —
 * never told who reported; from REPORT_RULES.reviewAt open reports it waits for the Editor Desk's decision (the Flags
 * badge counts it). Nothing is hidden automatically. The story's row stays locked meanwhile.
 */
export async function createFlag(userId: string, articleId: string, input: FlagData): Promise<void> {
  const authorId = await findVisibleAuthor(articleId);
  if (!authorId) throw notFound("Story not found");
  if (authorId === userId) throw new ApiError(400, "cannot_flag_own", "You can't report your own story");
  try {
    await db.transaction(async (tx) => {
      const [story] = await tx.select().from(article).where(eq(article.id, articleId)).for("update").limit(1);
      if (!story) throw notFound("Story not found");
      await tx.insert(articleFlag).values({ articleId, userId, reason: input.reason, note: input.note });
      await notifyReported(tx, story, input.reason, input.note);
      const note = input.note?.trim();
      await createNotice(tx, {
        userId: story.authorId,
        kind: "warning",
        articleId: story.id,
        articleTitle: story.title,
        message: `A reader reported this story for ${FLAG_REASON_LABELS[input.reason].toLowerCase()}${note ? `: “${note}”` : ""}. Check it — the Editor Desk reviews stories readers report.`,
        createdBy: null,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "article_flag_open_unique")) {
      throw new ApiError(409, "already_flagged", "You've already reported this story — the Editor Desk is looking at it");
    }
    throw error;
  }
}

const FLAGS_PER_GROUP = 20;

type GroupRow = { articleId: string; latestAt: Date; openCount: number; totalCount: number };

/**
 * Editor Desk queue grouped by story, newest report first. `open` = stories with open flags;
 * `resolved` = stories whose flags were all handled.
 */
export async function listFlagGroups(opts: { status: "open" | "resolved"; cursor: string | undefined; limit: number }): Promise<Page<AdminFlagGroup>> {
  const cursor = decodeCursor(opts.cursor);
  if (cursor && !isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  const having: SQL =
    opts.status === "open"
      ? sql`count(*) filter (where ${articleFlag.status} = 'open') > 0`
      : sql`count(*) filter (where ${articleFlag.status} = 'open') = 0`;
  const latest = sql<Date>`max(${articleFlag.createdAt})`;
  const cursorHaving = cursor ? sql` and (max(${articleFlag.createdAt}), ${articleFlag.articleId}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : sql``;
  const groups: GroupRow[] = await db
    .select({
      articleId: articleFlag.articleId,
      latestAt: latest.mapWith((v: string | Date) => new Date(v)),
      openCount: sql<number>`(count(*) filter (where ${articleFlag.status} = 'open'))::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(articleFlag)
    .groupBy(articleFlag.articleId)
    .having(sql`${having}${cursorHaving}`)
    .orderBy(desc(latest), desc(articleFlag.articleId))
    .limit(opts.limit + 1);

  const hasMore = groups.length > opts.limit;
  const page = hasMore ? groups.slice(0, opts.limit) : groups;
  const items = await buildGroups(page);
  const last = page.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(last.latestAt, last.articleId) : null };
}

async function buildGroups(groups: GroupRow[]): Promise<AdminFlagGroup[]> {
  if (groups.length === 0) return [];
  const ids = groups.map((g) => g.articleId);
  const [stories, flags] = await Promise.all([
    db
      .select({
        id: article.id,
        slug: article.slug,
        title: article.title,
        coverUrl: article.coverUrl,
        status: article.status,
        hiddenAt: article.hiddenAt,
        returnedAt: article.returnedAt,
        publishedAt: article.publishedAt,
        reportWarnedAt: article.reportWarnedAt,
        authorId: user.id,
        username: user.username,
        name: user.name,
        image: user.image,
        suspendedAt: user.suspendedAt,
      })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(inArray(article.id, ids)),
    db
      .select({
        id: articleFlag.id,
        articleId: articleFlag.articleId,
        reason: articleFlag.reason,
        note: articleFlag.note,
        status: articleFlag.status,
        resolution: articleFlag.resolution,
        createdAt: articleFlag.createdAt,
        resolvedAt: articleFlag.resolvedAt,
        byId: user.id,
        byUsername: user.username,
        byName: user.name,
        rank: sql<number>`row_number() over (partition by ${articleFlag.articleId} order by (${articleFlag.status} = 'open') desc, ${articleFlag.createdAt} desc)`,
      })
      .from(articleFlag)
      .innerJoin(user, eq(user.id, articleFlag.userId))
      .where(inArray(articleFlag.articleId, ids)),
  ]);
  const storyById = new Map(stories.map((s) => [s.id, s]));
  const out: AdminFlagGroup[] = [];
  for (const group of groups) {
    const story = storyById.get(group.articleId);
    if (!story) continue;
    const mine = flags.filter((f) => f.articleId === group.articleId);
    const reasons: Partial<Record<FlagReason, number>> = {};
    for (const f of mine) if (f.status === "open") reasons[f.reason] = (reasons[f.reason] ?? 0) + 1;
    out.push({
      article: {
        id: story.id,
        slug: story.slug,
        title: story.title,
        coverUrl: story.coverUrl,
        status: storyStatus(story),
        author: { id: story.authorId, username: story.username ?? "", name: story.name, image: story.image, suspended: Boolean(story.suspendedAt) },
      },
      openCount: group.openCount,
      totalCount: group.totalCount,
      reasons,
      latestAt: group.latestAt.toISOString(),
      needsDecision: group.openCount >= REPORT_RULES.reviewAt,
      flags: mine
        .filter((f) => Number(f.rank) <= FLAGS_PER_GROUP)
        .sort((a, b) => Number(a.rank) - Number(b.rank))
        .map(toAdminFlag),
    });
  }
  return out;
}

function toAdminFlag(f: {
  id: string;
  reason: FlagReason;
  note: string | null;
  status: "open" | "resolved";
  resolution: FlagResolution | null;
  createdAt: Date;
  resolvedAt: Date | null;
  byId: string;
  byUsername: string | null;
  byName: string;
}): AdminFlag {
  return {
    id: f.id,
    reason: f.reason,
    note: f.note,
    status: f.status,
    resolution: f.resolution,
    createdAt: f.createdAt.toISOString(),
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    by: { id: f.byId, username: f.byUsername, name: f.byName },
  };
}

/** Every flag on one story (Editor Desk story detail). */
export async function listStoryFlags(articleId: string): Promise<AdminFlag[]> {
  const rows = await db
    .select({
      id: articleFlag.id,
      reason: articleFlag.reason,
      note: articleFlag.note,
      status: articleFlag.status,
      resolution: articleFlag.resolution,
      createdAt: articleFlag.createdAt,
      resolvedAt: articleFlag.resolvedAt,
      byId: user.id,
      byUsername: user.username,
      byName: user.name,
    })
    .from(articleFlag)
    .innerJoin(user, eq(user.id, articleFlag.userId))
    .where(eq(articleFlag.articleId, articleId))
    .orderBy(sql`(${articleFlag.status} = 'open') desc`, desc(articleFlag.createdAt))
    .limit(100);
  return rows.map(toAdminFlag);
}

export type ResolveFlagsData = z.output<typeof resolveFlagsSchema>;

const RESOLUTION: Record<ResolveFlagsData["action"], FlagResolution> = {
  dismiss: "dismissed",
  hide: "hidden",
  warn: "warned",
  suspend: "suspended",
};

/**
 * Resolves every open flag on a story: dismiss · hide the story · warn the reporter · suspend the reporter.
 * Returns how many flags were resolved. The automatic warning's mark is cleared too, so a new wave of first-hour
 * reports would warn again.
 */
export async function resolveFlags(actor: Actor, articleId: string, input: ResolveFlagsData): Promise<{ resolved: number; resolution: FlagResolution }> {
  if (!isUuid(articleId)) throw notFound("Story not found");
  const [story] = await db
    .select({ id: article.id, title: article.title, authorId: article.authorId, username: user.username })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(eq(article.id, articleId))
    .limit(1);
  if (!story) throw notFound("Story not found");
  const resolution = RESOLUTION[input.action];

  if (input.action === "hide") await hideStory(actor, articleId, input.note ?? "Hidden after reader reports");
  if (input.action === "suspend") {
    if (story.authorId === actor.id) throw new ApiError(400, "cannot_modify_self", "You can't suspend yourself");
    await suspendUser(actor, story.authorId, input.note ?? "Suspended after reader reports");
  }

  return db.transaction(async (tx) => {
    const resolved = await tx
      .update(articleFlag)
      .set({ status: "resolved", resolution, resolvedBy: actor.id, resolvedAt: new Date() })
      .where(and(eq(articleFlag.articleId, articleId), eq(articleFlag.status, "open")))
      .returning({ id: articleFlag.id });
    await tx.update(article).set({ reportWarnedAt: null }).where(eq(article.id, articleId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "flags.resolve",
      targetType: "article",
      targetId: articleId,
      targetLabel: story.title,
      meta: { action: input.action, flags: resolved.length, note: input.note },
    });
    if (input.action === "warn") {
      // The reporter is told (banner + Newsroom), not just the audit log (owner rule 2026-09-25) — and in their bell,
      // which also brings the banner up live (owner 2026-10-01).
      await createNotice(tx, {
        userId: story.authorId,
        kind: "warning",
        articleId,
        articleTitle: story.title,
        message: input.note ?? null,
        createdBy: actor.id,
      });
      if (story.authorId !== actor.id) await notifyWarned(tx, story, input.note ?? null);
      await writeAudit(tx, {
        actorId: actor.id,
        action: "user.warn",
        targetType: "user",
        targetId: story.authorId,
        targetLabel: story.username ?? null,
        meta: { articleId, note: input.note },
      });
    }
    return { resolved: resolved.length, resolution };
  });
}
