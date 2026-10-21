import { and, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, articleRead, spotlightOrder } from "../db/schema.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError } from "../lib/errors.js";
import type {
  NewsroomBestTimes,
  NewsroomKpi,
  NewsroomRange,
  NewsroomSeries,
  NewsroomStory,
  NewsroomSummary,
  Page,
  PressPassSummary,
} from "../shared/contracts.js";
import { storyStatus } from "./articles.js";
import { ALL_LIKES, isUuid } from "./shared.js";

const DAY_MS = 86_400_000;
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

const TIME_ZONES = new Set<string>([...Intl.supportedValuesOf("timeZone"), "UTC"]);

/** IANA zone from `?tz=` (the reporter's browser); unknown values fall back to India time. */
export function resolveTimeZone(raw: string | undefined): string {
  return raw && TIME_ZONES.has(raw) ? raw : DEFAULT_TIME_ZONE;
}

const num = (value: number) => sql.raw(String(Math.trunc(value)));
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

function kpi(value: number, previous: number): NewsroomKpi {
  return { value, previous, delta: previous > 0 ? Math.round(((value - previous) / previous) * 1000) / 1000 : null };
}

type CountPair = { cur: number; prev: number };

/** KPI tiles for the last `range` days vs the `range` days before, plus lifetime totals. */
export async function newsroomSummary(userId: string, range: NewsroomRange, pass: PressPassSummary | null, now = new Date()): Promise<NewsroomSummary> {
  const from = new Date(now.getTime() - range * DAY_MS);
  const prevFrom = new Date(now.getTime() - 2 * range * DAY_MS);
  const pair = (table: SQL, alias: string, where: SQL) => sql`
    (select json_build_object(
      'cur', count(*) filter (where ${sql.raw(alias)}.created_at > ${ts(from)} and ${sql.raw(alias)}.created_at <= ${ts(now)}),
      'prev', count(*) filter (where ${sql.raw(alias)}.created_at > ${ts(prevFrom)} and ${sql.raw(alias)}.created_at <= ${ts(from)}))
     from ${table} ${sql.raw(alias)} ${where})`;
  const mine = sql`join article a on a.id = x.article_id where a.author_id = ${userId} and x.created_at > ${ts(prevFrom)}`;
  const result = await db.execute<{
    views: CountPair;
    reads: CountPair;
    likes: CountPair;
    shares: CountPair;
    followers: CountPair;
    totals: NewsroomSummary["totals"];
  }>(sql`
    select
      ${pair(sql`article_view`, "x", mine)} as views,
      ${pair(sql`article_read`, "x", mine)} as reads,
      ${pair(sql.raw(ALL_LIKES), "x", mine)} as likes,
      ${pair(sql`article_share`, "x", mine)} as shares,
      ${pair(sql`follow`, "x", sql`where x.following_id = ${userId} and x.created_at > ${ts(prevFrom)}`)} as followers,
      (select json_build_object(
        'followers', (select count(*) from follow f where f.following_id = ${userId}),
        'published', count(*) filter (where a.status = 'published'),
        'inReview', count(*) filter (where a.status = 'in_review'),
        'returned', count(*) filter (where a.status = 'draft' and a.returned_at is not null),
        'views', coalesce(sum(a.view_count) filter (where a.status = 'published'), 0),
        'likes', coalesce(sum(a.like_count) filter (where a.status = 'published'), 0),
        'shares', coalesce(sum(a.share_count) filter (where a.status = 'published'), 0))
       from article a where a.author_id = ${userId}) as totals
  `);
  const row = [...result][0];
  if (!row) throw new ApiError(500, "internal_error", "Analytics unavailable");
  const k = (p: CountPair) => kpi(Number(p.cur), Number(p.prev));
  return {
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    kpis: { views: k(row.views), reads: k(row.reads), likes: k(row.likes), shares: k(row.shares), followers: k(row.followers) },
    totals: {
      followers: Number(row.totals.followers),
      published: Number(row.totals.published),
      inReview: Number(row.totals.inReview),
      returned: Number(row.totals.returned),
      views: Number(row.totals.views),
      likes: Number(row.totals.likes),
      shares: Number(row.totals.shares),
    },
    pressPass: pass,
  };
}

/** One point per local day (in `timeZone`) for the last `range` days, today included. */
export async function newsroomSeries(userId: string, range: NewsroomRange, timeZone: string, now = new Date()): Promise<NewsroomSeries> {
  const tz = sql`${timeZone}::text`;
  const today = sql`(${ts(now)} at time zone ${tz})::date`;
  const start = sql`((${today} - ${num(range - 1)})::timestamp at time zone ${tz})`;
  const perDay = (table: string) => sql`
    select (x.created_at at time zone ${tz})::date as d, count(*)::int as n
    from ${sql.raw(table)} x join article a on a.id = x.article_id
    where a.author_id = ${userId} and x.created_at >= ${start} and x.created_at <= ${ts(now)}
    group by 1`;
  const result = await db.execute<{
    date: string;
    views: number;
    reads: number;
    likes: number;
    shares: number;
    followers: number;
    followersTotal: number;
  }>(sql`
    with
    days as (select (${today} - g)::date as d from generate_series(0, ${num(range - 1)}) as g),
    v as (${perDay("article_view")}),
    r as (${perDay("article_read")}),
    l as (${perDay(ALL_LIKES)}),
    s as (${perDay("article_share")}),
    f as (
      select (x.created_at at time zone ${tz})::date as d, count(*)::int as n from follow x
      where x.following_id = ${userId} and x.created_at >= ${start} and x.created_at <= ${ts(now)} group by 1
    ),
    base as (select count(*)::int as n from follow x where x.following_id = ${userId} and x.created_at < ${start})
    select to_char(days.d, 'YYYY-MM-DD') as date,
      coalesce(v.n, 0) as views, coalesce(r.n, 0) as reads, coalesce(l.n, 0) as likes, coalesce(s.n, 0) as shares,
      coalesce(f.n, 0) as followers,
      ((select n from base) + sum(coalesce(f.n, 0)) over (order by days.d))::int as "followersTotal"
    from days
    left join v on v.d = days.d left join r on r.d = days.d left join l on l.d = days.d
    left join s on s.d = days.d left join f on f.d = days.d
    order by days.d
  `);
  return {
    range,
    timeZone,
    points: [...result].map((p) => ({
      date: p.date,
      views: Number(p.views),
      reads: Number(p.reads),
      likes: Number(p.likes),
      shares: Number(p.shares),
      followers: Number(p.followers),
      followersTotal: Number(p.followersTotal),
    })),
  };
}

/** Below this many engagement events of your own, "best time" falls back to the whole platform. */
export const BEST_TIMES_MIN_SAMPLE = 30;

/**
 * Best hour / weekday to publish, from when your audience engages (views ·1, likes ·4, shares ·6 over
 * the last 90 days, in `timeZone`). Too little data → the platform's engagement (last 30 days).
 */
export async function newsroomBestTimes(userId: string, timeZone: string, now = new Date()): Promise<NewsroomBestTimes> {
  const own = await engagementGrid(sql`a.author_id = ${userId}`, new Date(now.getTime() - 90 * DAY_MS), now, timeZone);
  const useOwn = own.sample >= BEST_TIMES_MIN_SAMPLE;
  const grid = useOwn ? own : await engagementGrid(sql`a.status = 'published'`, new Date(now.getTime() - 30 * DAY_MS), now, timeZone);

  const byHour = Array.from({ length: 24 }, () => 0);
  const byDay = Array.from({ length: 7 }, () => 0);
  let best: { day: number; hour: number; score: number } | null = null;
  for (const cell of grid.cells) {
    byHour[cell.hour] = (byHour[cell.hour] ?? 0) + cell.score;
    byDay[cell.day] = (byDay[cell.day] ?? 0) + cell.score;
    if (!best || cell.score > best.score) best = cell;
  }
  const top = (values: number[], n: number) =>
    values
      .map((score, index) => ({ score, index }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, n)
      .map((e) => e.index);
  return {
    timeZone,
    basis: useOwn ? "you" : "platform",
    sample: grid.sample,
    byHour,
    byDay,
    best: best ? { day: best.day, hour: best.hour } : null,
    bestHours: top(byHour, 3),
    bestDays: top(byDay, 2),
  };
}

async function engagementGrid(scope: SQL, since: Date, until: Date, timeZone: string) {
  const tz = sql`${timeZone}::text`;
  const events = (table: string, weight: number) => sql`
    select x.created_at as t, ${num(weight)} as w from ${sql.raw(table)} x join article a on a.id = x.article_id
    where ${scope} and x.created_at > ${ts(since)} and x.created_at <= ${ts(until)}`;
  const result = await db.execute<{ day: number; hour: number; score: number; n: number }>(sql`
    with ev as (${events("article_view", 1)} union all ${events(ALL_LIKES, 4)} union all ${events("article_share", 6)})
    select (extract(isodow from (t at time zone ${tz}))::int - 1) as day, extract(hour from (t at time zone ${tz}))::int as hour,
      sum(w)::int as score, count(*)::int as n
    from ev group by 1, 2
  `);
  const cells = [...result].map((c) => ({ day: Number(c.day), hour: Number(c.hour), score: Number(c.score), n: Number(c.n) }));
  return { cells, sample: cells.reduce((sum, c) => sum + c.n, 0) };
}

/* ─────────────── Per-story table ─────────────── */

const storySortAt = sql`coalesce(${article.publishedAt}, ${article.submittedAt}, ${article.updatedAt})`;

/** Your stories that went out or through review (private drafts excluded), newest first. */
export async function newsroomStories(userId: string, opts: { cursor: string | undefined; limit: number }): Promise<Page<NewsroomStory>> {
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [
    eq(article.authorId, userId),
    or(inArray(article.status, ["published", "in_review"]), isNotNull(article.returnedAt)) as SQL,
  ];
  if (cursor) {
    if (!isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    conditions.push(sql`(${storySortAt}, ${article.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await db
    .select({
      article,
      readCount: sql<number>`(select count(*)::int from ${articleRead} r where r.article_id = ${article.id})`,
      sortAtMs: sql<number>`(extract(epoch from ${storySortAt}) * 1000)::float8`,
    })
    .from(article)
    .where(and(...conditions))
    .orderBy(sql`${storySortAt} desc, ${article.id} desc`)
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;

  const ids = items.map((r) => r.article.id);
  const orders =
    ids.length === 0
      ? []
      : await db
          .selectDistinctOn([spotlightOrder.articleId], {
            articleId: spotlightOrder.articleId,
            id: spotlightOrder.id,
            status: spotlightOrder.status,
            startsAt: spotlightOrder.startsAt,
            endsAt: spotlightOrder.endsAt,
          })
          .from(spotlightOrder)
          .where(inArray(spotlightOrder.articleId, ids))
          .orderBy(spotlightOrder.articleId, desc(spotlightOrder.createdAt));
  const orderByArticle = new Map(orders.map((o) => [o.articleId, o]));
  const nowMs = Date.now();

  const last = items.at(-1);
  return {
    items: items.map(({ article: a, readCount }) => {
      const order = orderByArticle.get(a.id);
      const running = Boolean(order && order.status === "granted" && order.startsAt && order.endsAt && order.startsAt.getTime() <= nowMs && order.endsAt.getTime() > nowMs);
      const status = storyStatus(a);
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        coverUrl: a.coverUrl,
        coverBlur: a.coverBlur,
        status,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        viewCount: a.viewCount,
        readCount: Number(readCount),
        likeCount: a.likeCount,
        shareCount: a.shareCount,
        engagementRate: a.viewCount > 0 ? Math.round(((a.likeCount + a.shareCount) / a.viewCount) * 10_000) / 10_000 : 0,
        editorsPick: a.pinnedAt !== null,
        spotlight: order
          ? {
              id: order.id,
              status: order.status === "granted" && order.endsAt && order.endsAt.getTime() <= nowMs ? "expired" : order.status,
              active: running,
              endsAt: order.endsAt?.toISOString() ?? null,
            }
          : null,
        reviewNote: status === "returned" ? a.reviewNote : null,
        hiddenReason: status === "hidden" ? a.hiddenReason : null,
      };
    }),
    nextCursor: hasMore && last ? encodeCursor(new Date(Number(last.sortAtMs)), last.article.id) : null,
  };
}
