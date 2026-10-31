import { and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/client.js";
import { contentLog } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import type { ContentLogAction, ContentLogEntry, Page } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

type Story = { id: string | null; title: string | null; slug: string | null };

/**
 * Writes one Reporter activity row (owner 2026-10-31) from the request: the account, who pressed the button (a group
 * member or the Editor Desk), the story and the IP / browser. Never fails the request it records.
 */
export async function logContent(
  c: Context<AppEnv>,
  action: ContentLogAction,
  story: Story,
  owner?: { id: string; username: string | null },
): Promise<void> {
  const viewer = c.get("viewer");
  if (!viewer) return;
  const account = owner ?? { id: viewer.id, username: viewer.username };
  const actor = viewer.actor
    ? { id: viewer.actor.id, username: viewer.actor.username }
    : account.id !== viewer.id
      ? { id: viewer.id, username: viewer.username }
      : null;
  try {
    await db.insert(contentLog).values({
      userId: account.id,
      username: account.username,
      actorId: actor?.id ?? null,
      actorUsername: actor?.username ?? null,
      action,
      articleId: story.id,
      articleTitle: story.title?.slice(0, 300) ?? null,
      articleSlug: story.slug,
      ip: c.get("clientIp") || null,
      userAgent: c.req.header("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (error) {
    console.error("[content-log] couldn't record", action, error);
  }
}

/** Newest first, 50 a page; `q` matches a username (the account's or the actor's) or a story title. */
export async function listContentLog(cursorRaw: string | undefined, q: string | undefined, limit = 50): Promise<Page<ContentLogEntry>> {
  const conditions: SQL[] = [];
  const cursor = decodeCursor(cursorRaw);
  if (cursor && /^\d+$/.test(cursor.id)) {
    conditions.push(sql`(${contentLog.createdAt}, ${contentLog.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::bigint)`);
  }
  const term = q?.trim().replace(/^@/, "");
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(contentLog.username, like), ilike(contentLog.actorUsername, like), ilike(contentLog.articleTitle, like))!);
  }
  const rows = await db
    .select()
    .from(contentLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contentLog.createdAt), desc(contentLog.id))
    .limit(limit + 1);
  const page = paginate(rows, limit, (row) => ({ at: row.createdAt, id: String(row.id) }));
  return {
    items: page.items.map((row) => ({
      id: String(row.id),
      action: row.action as ContentLogAction,
      createdAt: row.createdAt.toISOString(),
      user: { id: row.userId, username: row.username },
      actor: row.actorId ? { id: row.actorId, username: row.actorUsername } : null,
      article: { id: row.articleId, title: row.articleTitle, slug: row.articleSlug },
      ip: row.ip,
      userAgent: row.userAgent,
    })),
    nextCursor: page.nextCursor,
  };
}
