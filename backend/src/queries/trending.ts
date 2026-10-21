import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { RANKING } from "../lib/ranking.js";
import { toReporterLevel } from "../lib/roles.js";
import { ALL_LIKES, BADGE_LEVEL_U } from "./shared.js";
import { VISIBLE_SQL } from "./articles.js";
import type { TrendingHeadline } from "../shared/contracts.js";

const num = (value: number) => sql.raw(String(value));

type TrendingRow = {
  id: string;
  slug: string | null;
  title: string | null;
  publishedAtMs: number | string | null;
  username: string | null;
  name: string;
  reporterLevel: string | null;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  score: number | string;
  newest: boolean;
};

/**
 * Owner 2026-10-14: #1 is always the newest story on WebNEWS (marked `newest`, red border); the rest are ranked by
 * readers (views) in the last 24h, then likes, then their total views and likes.
 *
 * "Trending now" (SPEC §3.4b): engagement that happened in the last 24h — views + 4·likes + 6·shares
 * from the timestamped event tables. Stories published in the last 7 days fill the list when the last
 * day was quiet, ordered by total engagement. Only publicly visible stories (not hidden, author not
 * suspended). Uses the created_at indexes on article_view / article_like / article_share.
 */
export async function listTrending(limit: number, now: Date = new Date()): Promise<TrendingHeadline[]> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const w = RANKING.weights;
  const result = await db.execute<TrendingRow>(sql`
    with
    recent_views as (
      select article_id, count(*)::int as n from article_view
      where created_at > ${at} - interval '24 hours' and created_at <= ${at}
      group by article_id
    ),
    recent_likes as (
      select article_id, count(*)::int as n from ${sql.raw(ALL_LIKES)} l
      where created_at > ${at} - interval '24 hours' and created_at <= ${at}
      group by article_id
    ),
    recent_shares as (
      select article_id, count(*)::int as n from article_share
      where created_at > ${at} - interval '24 hours' and created_at <= ${at}
      group by article_id
    ),
    newest as (
      select a.id from article a join "user" u on u.id = a.author_id
      where ${VISIBLE_SQL} and a.published_at <= ${at}
      order by a.published_at desc, a.id desc
      limit 1
    ),
    cand as (
      select id from newest
      union select id from article
      where status = 'published' and published_at > ${at} - interval '7 days' and published_at <= ${at}
      union select article_id from recent_views
      union select article_id from recent_likes
      union select article_id from recent_shares
    )
    select a.id, a.slug, a.title,
      (extract(epoch from a.published_at) * 1000)::float8 as "publishedAtMs",
      u.username, u.name, ${BADGE_LEVEL_U} as "reporterLevel",
      a.view_count as "viewCount", a.like_count as "likeCount", a.share_count as "shareCount",
      (coalesce(v.n, 0) * ${num(w.view)} + coalesce(l.n, 0) * ${num(w.like)} + coalesce(s.n, 0) * ${num(w.share)}) as score,
      (a.id in (select id from newest)) as newest
    from cand
    join article a on a.id = cand.id
    join "user" u on u.id = a.author_id
    left join recent_views v on v.article_id = a.id
    left join recent_likes l on l.article_id = a.id
    left join recent_shares s on s.article_id = a.id
    where ${VISIBLE_SQL} and a.published_at <= ${at}
    order by (a.id in (select id from newest)) desc,
      coalesce(v.n, 0) desc, coalesce(l.n, 0) desc,
      a.view_count desc, a.like_count desc,
      a.published_at desc, a.id desc
    limit ${limit}
  `);
  return [...result].map((row) => ({
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    publishedAt: new Date(Number(row.publishedAtMs ?? 0)).toISOString(),
    author: { username: row.username ?? "", name: row.name, reporterLevel: toReporterLevel(row.reporterLevel) },
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    shareCount: row.shareCount,
    score: Number(row.score),
    newest: Boolean(row.newest),
  }));
}
