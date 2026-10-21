import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

/*
 * Online presence for Messages (owner 2026-10-01): a signed-in person's `user.last_active_at` is refreshed while their
 * live connection (GET /api/stream) is open — on connect and about every TOUCH_EVERY_MS. Each beat first checks the
 * connection's session still exists: once it's logged out (or expired) the stream ends, so a tab left open after
 * logging out never keeps the account online. Logging out also clears the time at once (app.ts). Clients call someone
 * online when that time is within PRESENCE_ONLINE_MS (shared/contracts.ts). Plain SQL, so the row's `updated_at`
 * (profile edits) is left alone.
 */

export const TOUCH_EVERY_MS = 45_000;

/** Last write per person in this process: several open tabs share one write per beat. */
const lastTouch = new Map<string, number>();

export async function touchPresence(userId: string, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastTouch.get(userId) ?? 0) < TOUCH_EVERY_MS - 1_000) return;
  lastTouch.set(userId, now);
  await db.execute(sql`update "user" set last_active_at = now() where id = ${userId}`);
}

/** Is this Better Auth session still signed in? */
export async function sessionAlive(sessionId: string): Promise<boolean> {
  const rows = await db.execute(sql`select 1 from session where id = ${sessionId} and expires_at > now() limit 1`);
  return rows.length > 0;
}

/** Logged out: offline right away (another device that's still open puts it back within one beat). */
export async function markOffline(userId: string): Promise<void> {
  lastTouch.delete(userId);
  await db.execute(sql`update "user" set last_active_at = null where id = ${userId}`);
}
