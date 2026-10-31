import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { userEvent } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { publishEvent } from "../lib/events.js";
import {
  TRACKED_FEATURES,
  type ActionCount,
  type AuthorSummary,
  type BehaviourEvent,
  type BehaviourOverview,
  type LiveVisitors,
  LIVE_WINDOW_MINUTES,
  type PersonBehaviour,
  type StoryInsights,
  type TrackEvent,
} from "../shared/contracts.js";

/*
 * Behaviour tracking (owner 2026-10-16): every tap on the site is stored with who made it (user_event), for publishers'
 * story insights (Newsroom → Insights), the Editor Desk's behaviour reports (Desk → Behaviour) and behaviour-based
 * features later. Days are India time.
 */

const TZ = "Asia/Kolkata";
const num = (value: unknown): number => Number(value ?? 0);
const iso = (value: unknown): string => new Date(value as string).toISOString();
const FEATURE_NAMES = Object.keys(TRACKED_FEATURES);

/** Saves one page's batch. Admin pages are never tracked (the client skips them too). */
export async function recordEvents(
  viewerKey: string,
  userId: string | null,
  platform: "web" | "app",
  events: TrackEvent[],
  from: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
): Promise<void> {
  const rows = events.filter((event) => !event.path.startsWith("/admin"));
  if (rows.length === 0) return;
  // Story ids that don't exist (deleted, or made up) are dropped rather than failing the batch.
  const ids = [...new Set(rows.map((event) => event.articleId).filter((id): id is string => Boolean(id)))];
  const known = new Set(
    ids.length === 0
      ? []
      : [
          ...(await db.execute<{ id: string }>(
            sql`select id from article where id in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          )),
        ].map((row) => row.id),
  );
  await db.insert(userEvent).values(
    rows.map((event) => ({
      viewerKey,
      userId,
      name: event.name,
      label: event.label || null,
      articleId: event.articleId && known.has(event.articleId) ? event.articleId : null,
      targetUsername: event.targetUsername?.toLowerCase() || null,
      path: event.path,
      platform,
      props: event.props && Object.keys(event.props).length > 0 ? event.props : null,
      ip: from.ip,
      userAgent: from.userAgent,
    })),
  );
  // Desk → Analytics updates live (owner 2026-10-16).
  await publishEvent(db, { t: "behaviour", id: userId ?? "" });
}

/** Activity is kept for BEHAVIOUR_KEEP_MONTHS (Privacy Policy), then deleted. Runs with the membership worker. */
export const BEHAVIOUR_KEEP_MONTHS = 24;
export async function pruneOldEvents(): Promise<void> {
  await db.execute(sql`delete from user_event where created_at < now() - make_interval(months => ${BEHAVIOUR_KEEP_MONTHS})`);
}

/* ─────────────── Newsroom → Insights ─────────────── */

/** Meta-Ads-style insights for one of the publisher's own stories. */
export async function getStoryInsights(articleId: string, authorId: string): Promise<StoryInsights> {
  const [story] = [
    ...(await db.execute<{ id: string; title: string | null; slug: string | null; cover_url: string | null; published_at: string | null; spotlight: boolean }>(sql`
      select a.id, a.title, a.slug, a.cover_url, a.published_at,
        exists (select 1 from spotlight_order so where so.article_id = a.id and so.status = 'granted'
          and so.starts_at <= now() and so.ends_at > now()) as spotlight
      from article a where a.id = ${articleId} and a.author_id = ${authorId}`)),
  ];
  if (!story) throw notFound("Story not found");

  const [totals] = [
    ...(await db.execute<Record<string, number>>(sql`
      select
        (select count(*) from article_view v where v.article_id = ${articleId}) as views,
        (select count(*) from article_read r where r.article_id = ${articleId}) as reads,
        (select count(*) from article_like l where l.article_id = ${articleId})
          + (select count(*) from article_anon_like l where l.article_id = ${articleId}) as likes,
        (select count(*) from article_comment m where m.article_id = ${articleId}) as comments,
        (select count(*) from article_share s where s.article_id = ${articleId}) as shares,
        (select count(*) from article_save s where s.article_id = ${articleId}) as saves,
        (select count(*) from user_event e where e.article_id = ${articleId} and e.name = 'click') as clicks,
        (select avg((e.props->>'seconds')::numeric) from user_event e
          where e.article_id = ${articleId} and e.name = 'read' and (e.props->>'seconds') ~ '^[0-9.]+$') as avg_read,
        (select count(distinct k) from (
          select 'u:' || l.user_id as k from article_like l where l.article_id = ${articleId}
          union select 'a:' || l.viewer_id from article_anon_like l where l.article_id = ${articleId}
          union select 'u:' || m.author_id from article_comment m where m.article_id = ${articleId}
          union select s.viewer_key from article_share s where s.article_id = ${articleId} and s.viewer_key is not null
          union select 'u:' || s.user_id from article_save s where s.article_id = ${articleId}
        ) engaged) as engaged,
        (select count(*) from follow f join article a on a.id = ${articleId}
          where f.following_id = a.author_id and f.created_at >= a.published_at
            and exists (select 1 from article_read r where r.article_id = a.id and r.viewer_key = 'u:' || f.follower_id)) as followed,
        (select count(*) from article_view v where v.article_id = ${articleId} and v.viewer_key like 'u:%') as signed_in,
        (select count(distinct e.viewer_key) filter (where e.platform = 'app') from user_event e where e.article_id = ${articleId}) as app,
        (select count(distinct e.viewer_key) filter (where e.platform = 'web') from user_event e where e.article_id = ${articleId}) as web
    `)),
  ];
  const t = totals ?? {};

  const daily = [
    ...(await db.execute<{ day: string; views: number; reads: number; likes: number; shares: number }>(sql`
      with days as (
        select generate_series(
          greatest((select (published_at at time zone ${TZ})::date from article where id = ${articleId}), (now() at time zone ${TZ})::date - 29),
          (now() at time zone ${TZ})::date, interval '1 day')::date as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day,
        (select count(*) from article_view v where v.article_id = ${articleId} and (v.created_at at time zone ${TZ})::date = d.day) as views,
        (select count(*) from article_read r where r.article_id = ${articleId} and (r.created_at at time zone ${TZ})::date = d.day) as reads,
        (select count(*) from article_like l where l.article_id = ${articleId} and (l.created_at at time zone ${TZ})::date = d.day)
          + (select count(*) from article_anon_like l where l.article_id = ${articleId} and (l.created_at at time zone ${TZ})::date = d.day) as likes,
        (select count(*) from article_share s where s.article_id = ${articleId} and (s.created_at at time zone ${TZ})::date = d.day) as shares
      from days d order by d.day`)),
  ];

  const actions = [
    ...(await db.execute<{ label: string; count: number; people: number }>(sql`
      select coalesce(nullif(e.label, ''), e.name) as label, count(*) as count, count(distinct e.viewer_key) as people
      from user_event e where e.article_id = ${articleId}
      group by 1 order by count(*) desc limit 40`)),
  ];
  const channels = [
    ...(await db.execute<{ channel: string; count: number }>(
      sql`select channel, count(*) as count from article_share where article_id = ${articleId} group by channel order by count(*) desc`,
    )),
  ];

  const views = num(t.views);
  const avg = t.avg_read === null || t.avg_read === undefined ? null : Math.round(Number(t.avg_read));
  return {
    story: {
      id: story.id,
      title: story.title ?? "Untitled story",
      slug: story.slug,
      coverUrl: story.cover_url,
      publishedAt: story.published_at ? iso(story.published_at) : null,
      spotlight: Boolean(story.spotlight),
    },
    funnel: { shown: views, opened: num(t.reads), engaged: num(t.engaged), followed: num(t.followed) },
    totals: {
      views,
      reads: num(t.reads),
      likes: num(t.likes),
      comments: num(t.comments),
      shares: num(t.shares),
      saves: num(t.saves),
      avgReadSeconds: avg,
      clicks: num(t.clicks),
    },
    daily: daily.map((d) => ({ date: d.day, views: num(d.views), reads: num(d.reads), likes: num(d.likes), shares: num(d.shares) })),
    actions: actions.map(toAction),
    shareChannels: channels.map((c) => ({ channel: c.channel, count: num(c.count) })),
    audience: { signedIn: num(t.signed_in), visitors: Math.max(0, views - num(t.signed_in)), app: num(t.app), web: num(t.web) },
  };
}

const toAction = (row: { label: string; count: number; people: number }): ActionCount => ({
  label: row.label,
  count: num(row.count),
  people: num(row.people),
});

/* ─────────────── Desk → Behaviour ─────────────── */

/** Site-wide behaviour over the last `days` days. */
export async function getBehaviourOverview(days: number): Promise<BehaviourOverview> {
  const since = sql`now() - make_interval(days => ${days})`;
  const [totals] = [
    ...(await db.execute<Record<string, number>>(sql`
      select count(*) as events, count(distinct viewer_key) as people,
        count(distinct viewer_key) filter (where user_id is not null) as signed_in,
        count(distinct viewer_key) filter (where user_id is null) as visitors,
        count(distinct viewer_key) filter (where platform = 'app') as app,
        count(distinct viewer_key) filter (where platform = 'web') as web
      from user_event where created_at >= ${since} and name <> 'heartbeat'`)),
  ];
  const daily = [
    ...(await db.execute<{ day: string; events: number; people: number }>(sql`
      with days as (
        select generate_series((now() at time zone ${TZ})::date - (${days} - 1), (now() at time zone ${TZ})::date, interval '1 day')::date as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day, count(e.id) as events, count(distinct e.viewer_key) as people
      from days d left join user_event e on (e.created_at at time zone ${TZ})::date = d.day and e.name <> 'heartbeat'
      group by d.day order by d.day`)),
  ];
  const features = [
    ...(await db.execute<{ name: string; count: number; people: number }>(sql`
      select name, count(*) as count, count(distinct viewer_key) as people
      from user_event where created_at >= ${since} and name in (${sql.join(
        FEATURE_NAMES.map((name) => sql`${name}`),
        sql`, `,
      )})
      group by name`)),
  ];
  const byName = new Map(features.map((f) => [f.name, f]));
  const topActions = [
    ...(await db.execute<{ label: string; count: number; people: number }>(sql`
      select coalesce(nullif(label, ''), name) as label, count(*) as count, count(distinct viewer_key) as people
      from user_event where created_at >= ${since} and name = 'click'
      group by 1 order by count(*) desc limit 30`)),
  ];
  const topPages = [
    ...(await db.execute<{ path: string; count: number; people: number }>(sql`
      select regexp_replace(path, '/a/[^/?#]+', '/a/…') as path, count(*) as count, count(distinct viewer_key) as people
      from user_event where created_at >= ${since} and name <> 'heartbeat'
      group by 1 order by count(*) desc limit 15`)),
  ];
  const topPeople = [
    ...(await db.execute<{ id: string; username: string | null; name: string; image: string | null; events: number; last_at: string }>(sql`
      select u.id, u.username, u.name, u.image, count(*) as events, max(e.created_at) as last_at
      from user_event e join "user" u on u.id = e.user_id
      where e.created_at >= ${since} and e.name <> 'heartbeat'
      group by u.id order by count(*) desc limit 20`)),
  ];
  const t = totals ?? {};
  return {
    days,
    totals: {
      events: num(t.events),
      people: num(t.people),
      signedIn: num(t.signed_in),
      visitors: num(t.visitors),
      app: num(t.app),
      web: num(t.web),
    },
    daily: daily.map((d) => ({ date: d.day, events: num(d.events), people: num(d.people) })),
    features: FEATURE_NAMES.map((name) => {
      const row = byName.get(name);
      return { name, label: TRACKED_FEATURES[name as keyof typeof TRACKED_FEATURES], count: num(row?.count), people: num(row?.people) };
    }),
    topActions: topActions.map(toAction),
    topPages: topPages.map((p) => ({ path: p.path, count: num(p.count), people: num(p.people) })),
    topPeople: topPeople.map((p) => ({ ...person(p), events: num(p.events), lastAt: iso(p.last_at) })),
  };
}

const person = (p: { id: string; username: string | null; name: string; image: string | null }): AuthorSummary => ({
  id: p.id,
  username: p.username ?? "",
  name: p.name,
  image: p.image,
});

/** Everything one person has done (signed-in activity only: visitors can't be tied to a profile). */
export async function getPersonBehaviour(username: string): Promise<PersonBehaviour> {
  const [found] = [
    ...(await db.execute<{ id: string; username: string | null; name: string; image: string | null; email: string | null; created_at: string }>(
      sql`select id, username, name, image, email, created_at from "user" where lower(username) = ${username.toLowerCase()} limit 1`,
    )),
  ];
  if (!found) throw notFound("Person not found");
  const id = found.id;
  const [totals] = [
    ...(await db.execute<Record<string, number>>(sql`
      select count(*) as events,
        count(distinct (created_at at time zone ${TZ})::date) as days,
        count(*) filter (where name = 'read') as reads,
        avg((props->>'seconds')::numeric) filter (where name = 'read' and (props->>'seconds') ~ '^[0-9.]+$') as avg_read,
        count(*) filter (where platform = 'app') as app,
        count(*) filter (where platform = 'web') as web
      from user_event where user_id = ${id} and name <> 'heartbeat'`)),
  ];
  const features = [
    ...(await db.execute<{ name: string; count: number }>(
      sql`select name, count(*) as count from user_event where user_id = ${id} and name not in ('click', 'heartbeat') group by name`,
    )),
  ];
  const byName = new Map(features.map((f) => [f.name, num(f.count)]));
  const topActions = [
    ...(await db.execute<{ label: string; count: number; people: number }>(sql`
      select coalesce(nullif(label, ''), name) as label, count(*) as count, 1 as people
      from user_event where user_id = ${id} and name = 'click'
      group by 1 order by count(*) desc limit 20`)),
  ];
  const categories = [
    ...(await db.execute<{ category: string; reads: number }>(sql`
      select a.category, count(*) as reads from article_read r join article a on a.id = r.article_id
      where r.viewer_key = ${`u:${id}`} and a.category is not null
      group by a.category order by count(*) desc limit 10`)),
  ];
  const timeline = [
    ...(await db.execute<{
      id: string; name: string; label: string | null; path: string; platform: "web" | "app"; article_id: string | null; title: string | null;
      props: Record<string, string | number | boolean> | null; created_at: string;
    }>(sql`
      select e.id, e.name, e.label, e.path, e.platform, e.article_id, a.title, e.props, e.created_at
      from user_event e left join article a on a.id = e.article_id
      where e.user_id = ${id} and e.name <> 'heartbeat' order by e.created_at desc limit 300`)),
  ];
  const t = totals ?? {};
  return {
    person: { ...person(found), email: found.email, joinedAt: iso(found.created_at) },
    totals: {
      events: num(t.events),
      days: num(t.days),
      reads: num(t.reads),
      avgReadSeconds: t.avg_read === null || t.avg_read === undefined ? null : Math.round(Number(t.avg_read)),
      app: num(t.app),
      web: num(t.web),
    },
    features: FEATURE_NAMES.map((name) => ({
      name,
      label: TRACKED_FEATURES[name as keyof typeof TRACKED_FEATURES],
      count: byName.get(name) ?? 0,
      people: 1,
    })),
    topActions: topActions.map(toAction),
    categories: categories.map((c) => ({ category: c.category, reads: num(c.reads) })),
    timeline: timeline.map(
      (e): BehaviourEvent => ({
        id: String(e.id),
        name: e.name,
        label: e.label,
        path: e.path,
        platform: e.platform,
        story: e.article_id ? { id: e.article_id, title: e.title ?? "Untitled story" } : null,
        props: e.props,
        at: iso(e.created_at),
      }),
    ),
  };
}

/* ─────────────── Live now ─────────────── */

/** Who's on WebNEWS right now: anyone with activity (a page opened, a tap) in the last LIVE_WINDOW_MINUTES. */
export async function getLiveVisitors(): Promise<LiveVisitors> {
  const since = sql`now() - make_interval(mins => ${LIVE_WINDOW_MINUTES})`;
  const [totals] = [
    ...(await db.execute<Record<string, number>>(sql`
      select count(distinct viewer_key) as total,
        count(distinct viewer_key) filter (where user_id is not null) as signed_in,
        count(distinct viewer_key) filter (where user_id is null) as visitors,
        count(distinct viewer_key) filter (where platform = 'app') as app,
        count(distinct viewer_key) filter (where platform = 'web') as web
      from user_event where created_at >= ${since}`)),
  ];
  const pages = [
    ...(await db.execute<{ path: string; people: number }>(sql`
      select path, count(*) as people from (
        select distinct on (viewer_key) viewer_key, path from user_event where created_at >= ${since}
        order by viewer_key, created_at desc
      ) latest group by path order by count(*) desc limit 8`)),
  ];
  const people = [
    ...(await db.execute<{ id: string; username: string | null; name: string; image: string | null; path: string; at: string }>(sql`
      select u.id, u.username, u.name, u.image, latest.path, latest.created_at as at from (
        select distinct on (user_id) user_id, path, created_at from user_event
        where created_at >= ${since} and user_id is not null order by user_id, created_at desc
      ) latest join "user" u on u.id = latest.user_id order by latest.created_at desc limit 20`)),
  ];
  const t = totals ?? {};
  return {
    total: num(t.total),
    signedIn: num(t.signed_in),
    visitors: num(t.visitors),
    app: num(t.app),
    web: num(t.web),
    pages: pages.map((p) => ({ path: p.path, people: num(p.people) })),
    people: people.map((p) => ({ ...person(p), path: p.path, at: iso(p.at) })),
  };
}
