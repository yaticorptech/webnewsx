import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { DEMO_ALLOWED, readDemoSetting } from "./demo-engagement.js";
import { EVENTS_CHANNEL } from "./events.js";

/**
 * Live demo engagement (owner 2026-11-02): while demo mode is on, the demo views / likes / shares (stories) and followers
 * (accounts) keep growing on their own so the counts look alive. Only the demo columns are written — real counts are
 * never touched — and it never runs where demo mode isn't allowed. Tune the numbers here.
 */
const TICK_MS = 60_000; // how often the counts grow
const STORY_SHARE = 0.35; // about this share of stories gains something each tick (newer stories more often)
const MAX_VIEWS_PER_TICK = 6; // views added to a picked story: 1 … this
const LIKE_CHANCE = 0.3; // chance a picked story also gains a like
const SHARE_CHANCE = 0.08; // chance a picked story also gains a share
const FOLLOW_CHANCE = 0.25; // chance an account gains a follower each tick
const MAX_FOLLOWERS_PER_TICK = 2; // followers added to a picked account: 1 … this
const CAP = { views: 5000, likes: 2000, shares: 600, followers: 3000 }; // demo numbers stop growing here

/** A code constant written into the SQL as a literal (bound parameters get typed as integers here). */
const n = (value: number) => sql.raw(String(value));

export async function growDemoEngagement(): Promise<number> {
  const updated = await db.execute<{ id: string }>(sql`
    update article set
      demo_views = least(${n(CAP.views)}, demo_views + floor(random() * ${n(MAX_VIEWS_PER_TICK)})::int + 1),
      demo_likes = least(${n(CAP.likes)}, demo_likes + (random() < ${n(LIKE_CHANCE)})::int),
      demo_shares = least(${n(CAP.shares)}, demo_shares + (random() < ${n(SHARE_CHANCE)})::int)
    where status = 'published'
      and demo_views < ${n(CAP.views)}
      and random() < case
        when published_at > now() - interval '2 days' then ${n(Math.min(1, STORY_SHARE * 2))}
        when published_at > now() - interval '7 days' then ${n(STORY_SHARE)}
        else ${n(STORY_SHARE / 3)}
      end
    returning id`);
  // Open pages update live: one `article.stats` per grown story (the same event a real like or share sends).
  const ids = [...updated].map((r) => r.id);
  if (ids.length > 0) {
    await db.execute(sql`
      select pg_notify(${EVENTS_CHANNEL}, json_build_object('t', 'article.stats', 'id', id)::text)
      from unnest(array[${sql.join(
        ids.map((id) => sql`${id}::text`),
        sql`, `,
      )}]) as id`);
  }
  await db.execute(sql`
    update "user" set demo_followers = least(${n(CAP.followers)}, demo_followers + floor(random() * ${n(MAX_FOLLOWERS_PER_TICK)})::int + 1)
    where onboarded_at is not null and username is not null and suspended_at is null
      and demo_followers < ${n(CAP.followers)}
      and random() < ${n(FOLLOW_CHANCE)}`);
  return [...updated].length;
}

/** Returns the stop function (src/index.ts). A no-op where demo mode isn't allowed. */
export function startDemoEngagementTicker(): () => void {
  if (!DEMO_ALLOWED) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if ((await readDemoSetting()).enabled) await growDemoEngagement();
    } catch (error) {
      console.warn("[demo] engagement tick failed:", error instanceof Error ? error.message : error);
    }
    running = false;
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
