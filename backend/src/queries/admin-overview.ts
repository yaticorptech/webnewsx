import { and, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { adminAuditLog, user } from "../db/schema.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError } from "../lib/errors.js";
import { REPORT_RULES, type AdminOverview, type AuditEntry, type Page } from "../shared/contracts.js";
import { expireSpotlights } from "./spotlight.js";
import { isUuid } from "./shared.js";

function selectAudit() {
  return db
    .select({ entry: adminAuditLog, actorUsername: user.username, actorName: user.name })
    .from(adminAuditLog)
    .leftJoin(user, eq(user.id, adminAuditLog.actorId));
}

type AuditRow = Awaited<ReturnType<ReturnType<typeof selectAudit>["execute"]>>[number];

function toEntry(r: AuditRow): AuditEntry {
  const e = r.entry;
  return {
    id: e.id,
    action: e.action,
    actor: e.actorId ? { id: e.actorId, username: r.actorUsername, name: r.actorName ?? "" } : null,
    targetType: e.targetType,
    targetId: e.targetId,
    targetLabel: e.targetLabel,
    meta: e.meta,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Audit log, newest first. `action` filters by prefix ("story." / "user.role" …). */
export async function listAudit(opts: { action?: string | undefined; targetId?: string | undefined; cursor: string | undefined; limit: number }): Promise<Page<AuditEntry>> {
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [];
  if (opts.action) conditions.push(like(adminAuditLog.action, `${opts.action.replace(/[^a-z._]/g, "")}%`));
  if (opts.targetId) conditions.push(eq(adminAuditLog.targetId, opts.targetId));
  if (cursor) {
    if (!isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    conditions.push(sql`(${adminAuditLog.createdAt}, ${adminAuditLog.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await selectAudit()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = items.at(-1);
  return { items: items.map(toEntry), nextCursor: hasMore && last ? encodeCursor(last.entry.createdAt, last.entry.id) : null };
}

/** Editor Desk overview. "Today" = since local midnight in `timeZone`; "active" = the last 7 days. */
export async function adminOverview(timeZone: string): Promise<AdminOverview> {
  await expireSpotlights();
  const tz = sql`${timeZone}::text`;
  const result = await db.execute<AdminOverview["kpis"]>(sql`
    select
      (select count(*)::int from article where status = 'published'
         and published_at >= ((now() at time zone ${tz})::date::timestamp at time zone ${tz})) as "storiesToday",
      (select count(*)::int from article where status = 'published' and hidden_at is null) as "published",
      (select count(distinct k)::int from (
         select substring(viewer_key from 3) as k from article_view where viewer_key like 'u:%' and created_at > now() - interval '7 days'
         union select user_id from article_like where created_at > now() - interval '7 days'
         union select user_id from article_save where created_at > now() - interval '7 days'
      ) active) as "activeReaders",
      (select count(distinct author_id)::int from article
         where (published_at > now() - interval '7 days') or (submitted_at > now() - interval '7 days')) as "activeReporters",
      (select count(*)::int from article_flag where status = 'open') as "openFlags",
      (select count(distinct article_id)::int from article_flag where status = 'open') as "flaggedStories",
      (select count(*)::int from (select article_id from article_flag where status = 'open' group by article_id
        having count(*) >= ${REPORT_RULES.reviewAt}) d) as "needsDecision",
      (select count(*)::int from article where status = 'in_review') as "reviewQueue",
      (select count(*)::int from spotlight_order where status = 'pending') as "spotlightRequests",
      (select count(*)::int from contact_message where handled_at is null) as "newMessages",
      (select count(*)::int from spotlight_order where status = 'granted' and starts_at <= now() and ends_at > now()) as "activeSpotlights",
      (select count(*)::int from "user") as "users",
      (select count(*)::int from press_pass where revoked_at is null) as "reporters",
      (select count(*)::int from press_pass where revoked_at is null and level = 'trainee') as "trainees",
      (select count(*)::int from "user" where suspended_at is not null) as "suspended"
  `);
  const kpis = [...result][0];
  if (!kpis) throw new ApiError(500, "internal_error", "Overview unavailable");
  const recent = await selectAudit().orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id)).limit(10);
  return {
    kpis: Object.fromEntries(Object.entries(kpis).map(([k, v]) => [k, Number(v)])) as AdminOverview["kpis"],
    recent: recent.map(toEntry),
  };
}
