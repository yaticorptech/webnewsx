import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { siteSetting } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEMO_ALLOWED, DEMO_SETTING_KEY, readDemoSetting, type DemoSetting } from "../lib/demo-engagement.js";
import { ApiError } from "../lib/errors.js";
import type { DemoAction, DemoEngagementStatus } from "../shared/contracts.js";

/**
 * Who may get demo followers (owner 2026-11-02): only the demo accounts ("Added by Claude", `added_by` set) that have a
 * published, visible story — never real people, never readers.
 */
export const HAS_STORY = sql`("user".added_by is not null and exists (select 1 from article sa where sa.author_id = "user".id and sa.status = 'published' and sa.hidden_at is null))`;

async function saveSetting(next: DemoSetting, actorId: string): Promise<void> {
  await db
    .insert(siteSetting)
    .values({ key: DEMO_SETTING_KEY, value: next, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSetting.key, set: { value: next, updatedBy: actorId, updatedAt: new Date() } });
}

/** Status for the Editor Desk: allowed here?, on?, last generation, and real / demo / shown totals. */
export async function demoStatus(): Promise<DemoEngagementStatus> {
  const setting = DEMO_ALLOWED ? await readDemoSetting() : { enabled: false, generatedAt: null, stories: 0, accounts: 0 };
  const [t] = [
    ...(await db.execute<{ v: number; l: number; s: number; dv: number; dl: number; ds: number }>(sql`
      select coalesce(sum(view_count), 0)::int as v, coalesce(sum(like_count), 0)::int as l, coalesce(sum(share_count), 0)::int as s,
             coalesce(sum(demo_views), 0)::int as dv, coalesce(sum(demo_likes), 0)::int as dl, coalesce(sum(demo_shares), 0)::int as ds
      from article where status = 'published'`)),
  ];
  const [f] = [
    ...(await db.execute<{ f: number; df: number }>(sql`
      select (select count(*) from follow)::int as f, coalesce((select sum(demo_followers) from "user"), 0)::int as df`)),
  ];
  const actual = { views: t?.v ?? 0, likes: t?.l ?? 0, shares: t?.s ?? 0, followers: f?.f ?? 0 };
  const demo = { views: t?.dv ?? 0, likes: t?.dl ?? 0, shares: t?.ds ?? 0, followers: f?.df ?? 0 };
  const on = DEMO_ALLOWED && setting.enabled;
  return {
    allowed: DEMO_ALLOWED,
    enabled: on,
    generatedAt: setting.generatedAt,
    stories: setting.stories,
    accounts: setting.accounts,
    actual,
    demo,
    shown: on
      ? { views: actual.views + demo.views, likes: actual.likes + demo.likes, shares: actual.shares + demo.shares, followers: actual.followers + demo.followers }
      : actual,
  };
}

/**
 * Editor Desk actions. Refused (403) where demo mode isn't allowed — the public site — whatever the request says.
 * generate = new random numbers for every published story and every account with one (replaces earlier ones); reset = all
 * demo numbers to 0.
 * Real counts are never written.
 */
export async function runDemoAction(action: DemoAction, actorId: string): Promise<DemoEngagementStatus> {
  if (!DEMO_ALLOWED) throw new ApiError(403, "demo_not_allowed", "Demo engagement is only available on local development and staging");
  const current = await readDemoSetting();
  if (action === "enable" || action === "disable") {
    await saveSetting({ ...current, enabled: action === "enable" }, actorId);
  } else if (action === "generate") {
    // Views 1–200; likes up to about half the views; shares up to about a third of the likes — every number 1–200.
    const updated = await db.execute<{ id: string }>(sql`
      update article set
        demo_views = v.views,
        demo_likes = greatest(1, least(200, floor(random() * v.views * 0.5)::int + 1)),
        demo_shares = greatest(1, least(200, floor(random() * v.views * 0.18)::int + 1))
      from (select id, (floor(random() * 200)::int + 1) as views from article where status = 'published') v
      where article.id = v.id
      returning article.id`);
    // Followers 1–200 only for demo accounts with a published story (owner 2026-11-02: not real people, not readers).
    await db.execute(sql`update "user" set demo_followers = 0 where demo_followers <> 0 and not ${HAS_STORY}`);
    const accounts = await db.execute<{ id: string }>(sql`
      update "user" set demo_followers = floor(random() * 200)::int + 1
      where onboarded_at is not null and username is not null and suspended_at is null and ${HAS_STORY}
      returning id`);
    await saveSetting(
      { ...current, generatedAt: new Date().toISOString(), stories: [...updated].length, accounts: [...accounts].length },
      actorId,
    );
  } else {
    await db.execute(sql`update article set demo_views = 0, demo_likes = 0, demo_shares = 0 where demo_views <> 0 or demo_likes <> 0 or demo_shares <> 0`);
    await db.execute(sql`update "user" set demo_followers = 0 where demo_followers <> 0`);
    await saveSetting({ ...current, generatedAt: null, stories: 0, accounts: 0 }, actorId);
  }
  await writeAudit(db, { actorId, action: "demo.engagement", targetType: "setting", targetId: DEMO_SETTING_KEY, targetLabel: "Demo engagement", meta: { action } });
  await readDemoSetting();
  return demoStatus();
}

