import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { diversify, encodeRankCursor, RANKING, type RankCursor } from "../lib/ranking.js";
import { SPOTLIGHT_RANKING, type ArticleCard, type Page } from "../shared/contracts.js";
import { activeSpotlightSql, listEditorsPicks, toCard, VISIBLE_SQL, type CardRow } from "./articles.js";
import { BADGE_LEVEL_U } from "./shared.js";

/** Numeric constants are inlined (not bound) so PostgreSQL resolves power()/interval types unambiguously. */
const num = (value: number) => sql.raw(String(value));
const days = (value: number) => sql.raw(`interval '${value} days'`);

type RankedRow = Omit<CardRow, "publishedAt"> & { publishedAtMs: number | string | null };

/**
 * One page of the ranked "For You" feed (SPEC §3.4b + §3.11) in a single SQL statement:
 * candidates = visible stories published in the 14 days up to `asOf`, scored with the hot formula,
 * cold-start floor (20th percentile of the window), the viewer's personalization and the Spotlight
 * boost; when the window runs out, older stories follow chronologically. Signals are only counted up
 * to `asOf` (follows, likes, views), so the viewer's own scrolling doesn't reshuffle later pages.
 * Page 1 starts with the Editor's Picks, which are left out of the ranked list.
 * Uses article_feed_idx (window range scan), follow/article_like PKs and article_view's PK.
 */
export async function listForYou(opts: ForYouOptions): Promise<Page<ArticleCard>> {
  const asOf = opts.cursor?.asOf ?? new Date();
  const offset = opts.cursor?.offset ?? 0;
  const picks = opts.cursor ? [] : await listEditorsPicks(opts.viewerId);
  const pickCount = opts.cursor ? (opts.cursor.picks ?? 0) : picks.length;
  const limit = Math.max(opts.limit - picks.length, 1);
  const result = await db.execute<RankedRow>(forYouQuery({ ...opts, limit }, asOf, offset, pickCount));
  const cards = [...result].map((row) =>
    toCard({ ...row, publishedAt: row.publishedAtMs === null ? null : new Date(Number(row.publishedAtMs)) }, opts.viewerId),
  );
  const hasMore = cards.length > limit;
  const ranked = diversify(hasMore ? cards.slice(0, limit) : cards, (card) => card.author.id);
  return {
    items: [...picks, ...ranked],
    nextCursor: hasMore ? encodeRankCursor({ asOf, offset: offset + limit, picks: pickCount }) : null,
  };
}

export type ForYouOptions = {
  viewerId: string | null;
  /** `u:<userId>` or `a:<wn_vid>` — the seen-penalty key; null when unknown. */
  viewerKey: string | null;
  cursor: RankCursor | null;
  limit: number;
};

/**
 * The ranked page as one statement: rows `offset+1 … offset+limit+1` (the extra row = "has more").
 * `picks` = Editor's Picks shown before the ranked list on page 1 (aligns the Spotlight blocks).
 */
export function forYouQuery(opts: ForYouOptions, asOf: Date, offset: number, picks = 0): SQL {
  const at = sql`${asOf.toISOString()}::timestamptz`;
  const viewer = opts.viewerId;
  const m = RANKING.multipliers;
  const w = RANKING.weights;
  const upTo = offset + opts.limit + 1;
  const B = SPOTLIGHT_RANKING.blockSize;

  const personal = viewer
    ? sql`
        * (case when c.author_id in (select author_id from followed) then ${num(m.follows)} else 1 end)
        * (case when c.author_id in (select author_id from liked_authors) then ${num(m.likedAuthor)} else 1 end)
        * (case when c.author_id = ${viewer} then ${num(m.own)} else 1 end)`
    : sql``;
  const seen = opts.viewerKey
    ? sql`exists (
        select 1 from article_view v
        where v.article_id = c.id and v.viewer_key = ${opts.viewerKey} and v.created_at <= ${at}
      )`
    : sql`false`;
  // Fresh slots: the best-scoring unseen < 2h story sorts just before natural rank `best`, the
  // newest remaining ones before the `newest` ranks (unless they already rank higher).
  const slots = RANKING.freshSlots;
  const newestKey = sql.join(
    slots.newest.map((rank, i) => sql`when recent_n = ${num(i + 1)} then least(n, ${num(rank - 0.5)})`),
    sql` `,
  );

  return sql`
    with
    followed as (
      select following_id as author_id from follow
      where follower_id = ${viewer} and created_at <= ${at}
    ),
    liked_authors as (
      select distinct a2.author_id from article_like l
      join article a2 on a2.id = l.article_id
      where l.user_id = ${viewer} and l.created_at <= ${at} and l.created_at > ${at} - ${days(RANKING.likedAuthorDays)}
    ),
    cand as (
      select a.id, a.author_id, a.published_at, ${activeSpotlightSql(at)} as spot,
        greatest(extract(epoch from (${at} - a.published_at)) / 3600.0, 0)::float8 as age_h,
        power((a.view_count * ${num(w.view)} + a.like_count * ${num(w.like)} + a.share_count * ${num(w.share)} + 1)::float8, ${num(RANKING.engagementExponent)})
          / power(greatest(extract(epoch from (${at} - a.published_at)) / 3600.0, 0)::float8 + ${num(RANKING.ageOffsetHours)}, ${num(RANKING.gravity)}) as hot
      from article a
      join "user" u on u.id = a.author_id
      where ${VISIBLE_SQL} and a.pinned_at is null
        and a.published_at <= ${at} and a.published_at > ${at} - ${days(RANKING.windowDays)}
    ),
    floor as (
      select coalesce(percentile_cont(${num(RANKING.coldStartPercentile)}) within group (order by hot), 0)::float8 as f from cand
    ),
    signals as (
      select c.*, ${seen} as seen from cand c
    ),
    scored as (
      select c.id, c.published_at, c.spot,
        (case when c.age_h < ${num(RANKING.coldStartHours)} then greatest(c.hot, floor.f) else c.hot end)
        ${personal}
        * (case when c.seen then ${num(m.seen)} else 1 end)
        * (case when c.spot then ${num(SPOTLIGHT_RANKING.multiplier)} else 1 end) as score,
        (c.age_h < ${num(RANKING.coldStartHours)} and not c.seen) as fresh
      from signals c cross join floor
    ),
    ranked as (
      select id, published_at, fresh, spot,
        row_number() over (order by score desc, published_at desc, id desc) as n,
        row_number() over (partition by fresh order by score desc, published_at desc, id desc) as best_n
      from scored
    ),
    slotted as (
      select *,
        row_number() over (partition by (fresh and best_n > 1) order by published_at desc, id desc) as recent_n
      from ranked
    ),
    keyed as (
      select id, published_at, spot, 0 as tier,
        (case
          when not fresh then n
          when best_n = 1 then least(n, ${num(slots.best - 0.5)})
          else (case ${newestKey} else n end)
        end)::float8 as k
      from slotted
      union all
      (
        select a.id, a.published_at, false as spot, 1 as tier, null::float8 as k
        from article a
        join "user" u on u.id = a.author_id
        where ${VISIBLE_SQL} and a.pinned_at is null
          and a.published_at <= ${at} - ${days(RANKING.windowDays)}
        order by a.published_at desc nulls last, a.id desc
        limit ${upTo}
      )
    ),
    nat as (
      select id, spot, row_number() over (order by tier, k asc nulls last, published_at desc, id desc) as rn from keyed
    ),
    -- Spotlight: at most one per 10-story front-page block (lib/ranking.ts placeSpotlights). The j-th
    -- spotlight goes to block b_j = max(b_{j-1} + 1, its natural block): natural position when free,
    -- otherwise the lead slot of that block. Blocks are counted on the displayed page (picks first).
    spots as (
      select id, rn, row_number() over (order by rn) as j from nat where spot
    ),
    spot_blocks as (
      select id, rn, j,
        (j - 1) + max(((rn + ${num(picks)} - 1) / ${num(B)}) - (j - 1)) over (order by j rows between unbounded preceding and current row) as b
      from spots
    ),
    final as (
      select id, (row_number() over (order by rn))::float8 as key from nat where not spot
      union all
      select id,
        (${num(B)} * b
          + greatest(case when b = 0 then ${num(picks + 1)} else 1 end, least(${num(B)}, rn + ${num(picks)} - ${num(B)} * b))
          - ${num(picks)} - j + 0.5)::float8 as key
      from spot_blocks
    ),
    ordered as (
      select id, row_number() over (order by key, id) as rn from final
    ),
    page as (
      select id, rn from ordered where rn > ${offset} and rn <= ${upTo}
    )
    select
      a.id, a.slug, a.short_code as "shortCode", a.title, a.excerpt, a.blurb,
      a.cover_url as "coverUrl", a.cover_width as "coverWidth", a.cover_height as "coverHeight", a.cover_blur as "coverBlur",
      a.article_image_url as "articleImageUrl", a.article_image_width as "articleImageWidth",
      a.article_image_height as "articleImageHeight", a.article_image_blur as "articleImageBlur",
      a.video_url as "videoUrl", a.video_width as "videoWidth", a.video_height as "videoHeight", a.video_duration_ms as "videoDurationMs",
      a.link_url as "linkUrl", a.link_domain as "linkDomain", a.reading_minutes as "readingMinutes",
      a.category, a.district, a.template,
      a.poster_x as "posterX", a.poster_y as "posterY", a.poster_zoom as "posterZoom", a.poster_overlay_url as "posterOverlayUrl",
      a.view_count as "viewCount", a.like_count as "likeCount", a.share_count as "shareCount", a.comment_count as "commentCount",
      (extract(epoch from a.published_at) * 1000)::float8 as "publishedAtMs",
      u.id as "authorId", u.username as "authorUsername", u.name as "authorName", u.image as "authorImage", u.bio as "authorBio",
      ${BADGE_LEVEL_U} as "reporterLevel",
      ${activeSpotlightSql(at)} as spotlight,
      (a.pinned_at is not null) as "editorsPick",
      (a.hidden_at is not null) as hidden,
      a.premium,
      ${
        viewer
          ? sql`(a.premium and exists (select 1 from membership_payment m where m.member_id = ${viewer} and m.reporter_id = a.author_id and m.status = 'paid' and m.period_end > now()))`
          : sql`false`
      } as member,
      ${viewer ? sql`exists (select 1 from article_save z where z.article_id = a.id and z.user_id = ${viewer})` : sql`false`} as saved,
      ${
        viewer
          ? sql`(select r.reason from article_flag r where r.article_id = a.id and r.user_id = ${viewer} and r.status = 'open' limit 1)`
          : sql`null`
      } as reported,
      ${
        viewer
          ? sql`exists (select 1 from article_like x where x.article_id = a.id and x.user_id = ${viewer})`
          : sql`false`
      } as liked,
      ${
        viewer
          ? sql`exists (select 1 from follow y where y.follower_id = ${viewer} and y.following_id = a.author_id)`
          : sql`false`
      } as "followingAuthor"
    from page
    join article a on a.id = page.id
    join "user" u on u.id = a.author_id
    order by page.rn
  `;
}
