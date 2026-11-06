import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { publishEvent } from "./events.js";
import { isLinkCollision, makeShortCode, makeSlug } from "./slug.js";
import { notifyFollowers } from "../queries/notifications.js";
import { enqueueSocialPosts } from "../queries/social-accounts.js";

const TICK_MS = 30_000;
const BATCH = 20;

/**
 * Scheduled publishing (owner 2026-11-06: "schedule it and auto upload"): every 30 s, drafts whose `scheduled_at` has
 * come go live exactly like the composer's Publish — slug + short code, publish time = now, followers' bell + phone
 * push, Instagram / Facebook auto-post, live feeds refreshed; scheduled birthday wishes / invitations join the feed. Each story is locked (`skip locked`) in its own
 * transaction, so several API instances never publish one twice. Returns how many went live.
 */
export async function publishDueStories(): Promise<number> {
  // Birthday wishes / invitations: they just join the feed, as if posted now.
  const wishes = (await db.execute(sql`
    update wish set created_at = now(), scheduled_at = null
    where scheduled_at is not null and scheduled_at <= now()
    returning id
  `)) as unknown as { id: string }[];
  if (wishes.length > 0) console.log(`[scheduled] ${wishes.length} wish${wishes.length === 1 ? "" : "es"} now in the feed`);
  const due = (await db.execute(sql`
    select id from article
    where status = 'draft' and scheduled_at is not null and scheduled_at <= now()
    order by scheduled_at
    limit ${BATCH}
  `)) as unknown as { id: string }[];
  let published = 0;
  for (const { id } of due) {
    if (await publishOne(id)) published++;
  }
  return published;
}

/** One story, in its own transaction (a broken draft never holds up the others). */
async function publishOne(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = (await tx.execute(sql`
          select id, author_id, title from article
          where id = ${id} and status = 'draft' and scheduled_at <= now()
          for update skip locked
        `)) as unknown as { id: string; author_id: string; title: string | null }[];
        if (!row) return false; // already published, unscheduled, or another instance has it
        await tx.execute(sql`
          update article set
            status = 'published',
            slug = ${makeSlug(row.title ?? "story")},
            short_code = coalesce(short_code, ${makeShortCode()}),
            published_at = now(),
            updated_at = now(),
            edited_at = null,
            scheduled_at = null
          where id = ${row.id}
        `);
        await notifyFollowers(tx, row.id);
        await enqueueSocialPosts(tx, row.id, row.author_id);
        await publishEvent(tx, { t: "article.published", id: row.id });
        return true;
      });
    } catch (error) {
      if (isLinkCollision(error)) continue; // a slug / short code clash: retry with new ones
      // Not publishable (e.g. missing cover or body): it stays a draft, and is not retried every 30 s.
      console.warn(`[scheduled] ${id} could not go live:`, error instanceof Error ? error.message : error);
      await db.execute(sql`update article set scheduled_at = null where id = ${id}`);
      return false;
    }
  }
  return false;
}

/** Runs the scheduler every 30 s (timers never keep the process alive). Returns the stop function (src/index.ts). */
export function startScheduledPublisher(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const count = await publishDueStories();
      if (count > 0) console.log(`[scheduled] ${count} stor${count === 1 ? "y" : "ies"} went live`);
    } catch (error) {
      console.warn("[scheduled] publish failed:", error instanceof Error ? error.message : error);
    }
    running = false;
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
