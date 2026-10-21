import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "../db/schema.js";
import { ApiError } from "../lib/errors.js";
import type { Cursor } from "../lib/cursor.js";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Badge level shown next to an author's name (cards, bylines, lists, rails): Editor Desk accounts carry
 * the Verified badge (SPEC §3.11), everyone else their Press Pass level (null for readers). Select-list
 * expression over the "user" table; map it with `toReporterLevel`.
 */
export const badgeLevelSql = sql<string | null>`case when ${user.role} = 'admin' then 'verified' else ${user.reporterLevel} end`;

/** Raw-SQL twin of `badgeLevelSql` for queries that alias the user table as `u`. */
export const BADGE_LEVEL_U = sql.raw(`(case when u.role = 'admin' then 'verified' else u.reporter_level end)`);

/** `ORDER BY col DESC NULLS LAST` — matches the btree indexes drizzle-kit generated. */
export const descNullsLast = (column: AnyPgColumn): SQL => sql`${column} desc nulls last`;

/** Keyset predicate `(tsCol, idCol) < (cursor.at, cursor.id)` for descending pagination. */
export function beforeCursor(tsCol: AnyPgColumn, idCol: AnyPgColumn, cursor: Cursor, idType: "uuid" | "text"): SQL {
  if (idType === "uuid" && !isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  const idParam = idType === "uuid" ? sql`${cursor.id}::uuid` : sql`${cursor.id}::text`;
  return sql`(${tsCol}, ${idCol}) < (${cursor.at.toISOString()}::timestamptz, ${idParam})`;
}

export function clampLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Every like (accounts' and logged-out visitors') as `(article_id, created_at)` rows — for Trending and Newsroom
 * analytics, which only count likes per story and time. Use as a table: `from ${ALL_LIKES} x`.
 */
export const ALL_LIKES = "(select article_id, created_at from article_like union all select article_id, created_at from article_anon_like)";
