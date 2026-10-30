import { and, asc, eq, ilike, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { article, articleFlag, articleLike, articleSave, follow, membershipPayment, pressPass, spotlightOrder, user, type ArticleRecord } from "../db/schema.js";
import { decodeCursor, paginate } from "../lib/cursor.js";
import { toReporterLevel } from "../lib/roles.js";
import {
  DEFAULT_POSTER_TEMPLATE,
  SPOTLIGHT_SHOW_CAP,
  type ArticleCard,
  type PressLanguage,
  type ArticleDetail,
  type ArticleMedia,
  type Category,
  type ArticleVideo,
  type ArticleReview,
  type ArticleStats,
  type DraftCard,
  type DraftDetail,
  type FeedTab,
  type OwnedArticle,
  type Page,
  type PosterFrame,
  type PosterTemplate,
  type StoryStatus,
  type FlagReason,
} from "../shared/contracts.js";
import { badgeLevelSql, beforeCursor, descNullsLast, isUuid } from "./shared.js";

/* ─────────────── Visibility (SPEC §3.11) ─────────────── */

/**
 * What the public may see: published, not hidden by the Editor Desk, author onboarded and not suspended.
 * In-review stories are never "published", so they're excluded too. Authors see their own statuses
 * through owner-only endpoints (drafts list, Newsroom, `hidden` cards on their own profile).
 */
export const visibleWhere = (): SQL =>
  and(eq(article.status, "published"), isNull(article.hiddenAt), isNotNull(user.username), isNull(user.suspendedAt)) as SQL;

/** Raw-SQL twin of {@link visibleWhere} for hand-written queries (`a` = article, `u` = author). */
export const VISIBLE_SQL = sql.raw(`a.status = 'published' and a.hidden_at is null and u.username is not null and u.suspended_at is null`);

/** Raw-SQL "Spotlight running at `at`" for article alias `a`. */
/** The story (drizzle `article`) has a Spotlight running right now. */
const spotlightNow = (): SQL =>
  sql`exists (select 1 from ${spotlightOrder} where ${spotlightOrder.articleId} = ${article.id} and ${spotlightOrder.status} = 'granted' and ${spotlightOrder.startsAt} <= now() and ${spotlightOrder.endsAt} > now())`;

export const activeSpotlightSql = (at: SQL = sql`now()`): SQL =>
  sql`exists (select 1 from spotlight_order so where so.article_id = a.id and so.status = 'granted' and so.starts_at <= ${at} and so.ends_at > ${at})`;

export function storyStatus(row: Pick<ArticleRecord, "status" | "hiddenAt" | "returnedAt">): StoryStatus {
  if (row.status === "published") return row.hiddenAt ? "hidden" : "published";
  if (row.status === "in_review") return "in_review";
  return row.returnedAt ? "returned" : "draft";
}

/* ─────────────── Card selection ─────────────── */

function cardColumns(viewerId: string | null) {
  return {
    id: article.id,
    slug: article.slug,
    shortCode: article.shortCode,
    title: article.title,
    excerpt: article.excerpt,
    blurb: article.blurb,
    coverUrl: article.coverUrl,
    coverWidth: article.coverWidth,
    coverHeight: article.coverHeight,
    coverBlur: article.coverBlur,
    articleImageUrl: article.articleImageUrl,
    articleImageWidth: article.articleImageWidth,
    articleImageHeight: article.articleImageHeight,
    articleImageBlur: article.articleImageBlur,
    videoUrl: article.videoUrl,
    videoWidth: article.videoWidth,
    videoHeight: article.videoHeight,
    videoDurationMs: article.videoDurationMs,
    linkUrl: article.linkUrl,
    linkDomain: article.linkDomain,
    category: article.category,
    district: article.district,
    language: article.language,
    template: article.template,
    posterX: article.posterX,
    posterY: article.posterY,
    posterZoom: article.posterZoom,
    posterOverlayUrl: article.posterOverlayUrl,
    readingMinutes: article.readingMinutes,
    viewCount: article.viewCount,
    likeCount: article.likeCount,
    shareCount: article.shareCount,
    commentCount: article.commentCount,
    publishedAt: article.publishedAt,
    authorId: user.id,
    authorUsername: user.username,
    authorName: user.name,
    authorImage: user.image,
    authorBio: user.bio,
    reporterLevel: badgeLevelSql,
    liked: viewerId
      ? sql<boolean>`exists (select 1 from ${articleLike} where ${articleLike.articleId} = ${article.id} and ${articleLike.userId} = ${viewerId})`
      : sql<boolean>`false`,
    followingAuthor: viewerId
      ? sql<boolean>`exists (select 1 from ${follow} where ${follow.followerId} = ${viewerId} and ${follow.followingId} = ${article.authorId})`
      : sql<boolean>`false`,
    saved: viewerId
      ? sql<boolean>`exists (select 1 from ${articleSave} where ${articleSave.articleId} = ${article.id} and ${articleSave.userId} = ${viewerId})`
      : sql<boolean>`false`,
    // The viewer's open report on it (shown to them on the story, owner 2026-09-30).
    reported: viewerId
      ? sql<FlagReason | null>`(select ${articleFlag.reason} from ${articleFlag} where ${articleFlag.articleId} = ${article.id} and ${articleFlag.userId} = ${viewerId} and ${articleFlag.status} = 'open' limit 1)`
      : sql<FlagReason | null>`null`,
    spotlight: sql<boolean>`${spotlightNow()}`,
    editorsPick: sql<boolean>`(${article.pinnedAt} is not null)`,
    hidden: sql<boolean>`(${article.hiddenAt} is not null)`,
    premium: article.premium,
    // Premium stories (owner 2026-10-14): the viewer is a current member of the author.
    member: viewerId
      ? sql<boolean>`(${article.premium} and exists (select 1 from ${membershipPayment} where ${membershipPayment.memberId} = ${viewerId} and ${membershipPayment.reporterId} = ${article.authorId} and ${membershipPayment.status} = 'paid' and ${membershipPayment.periodEnd} > now()))`
      : sql<boolean>`false`,
  };
}

export type CardRow = {
  id: string;
  slug: string | null;
  shortCode: string | null;
  title: string | null;
  excerpt: string | null;
  blurb: string | null;
  coverUrl: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  coverBlur: string | null;
  articleImageUrl?: string | null;
  articleImageWidth?: number | null;
  articleImageHeight?: number | null;
  articleImageBlur?: string | null;
  videoUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoDurationMs: number | null;
  linkUrl: string | null;
  linkDomain: string | null;
  category: Category | null;
  district: string | null;
  language: PressLanguage | null;
  template: PosterTemplate | null;
  posterX: number | null;
  posterY: number | null;
  posterZoom: number | null;
  /** "own-frame" stories: the author's frame, as saved with the story. */
  posterOverlayUrl: string | null;
  readingMinutes: number | null;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  commentCount: number;
  publishedAt: Date | null;
  authorId: string;
  authorUsername: string | null;
  authorName: string;
  authorImage: string | null;
  authorBio: string | null;
  reporterLevel: string | null;
  liked: boolean;
  followingAuthor: boolean;
  saved: boolean;
  reported?: FlagReason | null;
  spotlight: boolean;
  editorsPick: boolean;
  hidden: boolean;
  premium?: boolean;
  member?: boolean;
};

/** The stored poster frame, or null (centred) unless all three parts are set. */
export function toPosterFrame(row: {
  posterX: number | null;
  posterY: number | null;
  posterZoom: number | null;
}): PosterFrame | null {
  const { posterX: x, posterY: y, posterZoom: zoom } = row;
  return x === null || y === null || zoom === null ? null : { x, y, zoom };
}

export function toCard(row: CardRow, viewerId: string | null): ArticleCard {
  const card: ArticleCard = {
    id: row.id,
    slug: row.slug ?? "",
    shortCode: row.shortCode,
    title: row.title ?? "",
    // The cards' text is the blurb only (owner 2026-10-15): no blurb → no text, the headline alone.
    excerpt: row.blurb ?? "",
    coverUrl: row.coverUrl ?? "",
    coverWidth: row.coverWidth,
    coverHeight: row.coverHeight,
    coverBlur: row.coverBlur,
    linkUrl: row.linkUrl,
    linkDomain: row.linkDomain,
    category: row.category,
    district: row.district,
    language: row.language,
    // Live stories always have one (stored on publish / approval, backfilled by migration 0012); belt and braces.
    template: row.template ?? DEFAULT_POSTER_TEMPLATE,
    posterFrame: toPosterFrame(row),
    posterOverlayUrl: row.posterOverlayUrl ?? null,
    articleImage: row.articleImageUrl
      ? { url: row.articleImageUrl, width: row.articleImageWidth ?? null, height: row.articleImageHeight ?? null, blur: row.articleImageBlur ?? null }
      : null,
    readingMinutes: row.readingMinutes ?? 1,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    shareCount: row.shareCount,
    commentCount: row.commentCount,
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    author: { id: row.authorId, username: row.authorUsername ?? "", name: row.authorName, image: row.authorImage },
    viewer: {
      liked: Boolean(row.liked),
      followingAuthor: Boolean(row.followingAuthor),
      isAuthor: viewerId !== null && viewerId === row.authorId,
      saved: Boolean(row.saved),
      reported: row.reported ?? null,
    },
    badges: {
      spotlight: Boolean(row.spotlight),
      editorsPick: Boolean(row.editorsPick),
      reporterLevel: toReporterLevel(row.reporterLevel),
    },
    video: toVideo(row),
    premium: Boolean(row.premium),
    locked: Boolean(row.premium) && !(viewerId !== null && viewerId === row.authorId) && !row.member,
  };
  // A locked premium story shows no text at all (owner 2026-10-14): photo and headline only.
  if (card.locked) card.excerpt = "";
  if (row.hidden) card.hidden = true;
  return card;
}

type VideoColumns = Pick<CardRow, "videoUrl" | "videoWidth" | "videoHeight" | "videoDurationMs">;

/** The story's video, or null for an image story (older rows / partial columns count as image stories). */
function toVideo(row: VideoColumns): ArticleVideo | null {
  if (!row.videoUrl || !row.videoWidth || !row.videoHeight || !row.videoDurationMs) return null;
  return { url: row.videoUrl, width: row.videoWidth, height: row.videoHeight, durationMs: row.videoDurationMs };
}

export function selectCards(viewerId: string | null, executor: Executor = db) {
  return executor.select(cardColumns(viewerId)).from(article).innerJoin(user, eq(user.id, article.authorId));
}

const cardCursor = (card: ArticleCard) => ({ at: new Date(card.publishedAt), id: card.id });

/* ─────────────── Editor's Picks ─────────────── */

/** Visible pinned stories, in the Editor Desk's order (they lead page 1 of For You and Latest). */
/** `languages`: only picks in these (a reader's own languages lead their Home — owner 2026-10-05). */
export async function listEditorsPicks(viewerId: string | null, languages: PressLanguage[] = []): Promise<ArticleCard[]> {
  const rows = await selectCards(viewerId)
    .where(and(visibleWhere(), isNotNull(article.pinnedAt), languages.length > 0 ? inArray(article.language, languages) : undefined))
    .orderBy(asc(article.pinOrder), asc(article.pinnedAt))
    .limit(3);
  return rows.map((row) => toCard(row, viewerId));
}

/* ─────────────── Feed ─────────────── */

/** At most this many spotlighted stories are woven into one feed. */
const SPOTLIGHT_MAX = 30;
/** The first spotlight comes after this many stories, then one after every SPOTLIGHT_EVERY more. */
const SPOTLIGHT_FIRST = 2;
const SPOTLIGHT_EVERY = 6;

/**
 * Spotlighted stories are woven into the feed like Instagram's sponsored posts (owner 2026-10-16: they no longer all
 * lead page 1 — new stories went to the bottom): one after the first SPOTLIGHT_FIRST stories, then one every
 * SPOTLIGHT_EVERY. Their order is reshuffled per visit (`seed`), so they take turns at the early slots. `scope` narrows
 * them (a category); the feeds leave them out of their own lists (`notSpotlit`), so each appears once.
 */
async function listSpotlit(viewerId: string | null, seed: string, scope: SQL[] = []): Promise<ArticleCard[]> {
  // A signed-in reader stops getting a spotlight's paid slot once it has been in SPOTLIGHT_SHOW_CAP of their visits or
  // they've opened the story (owner 2026-10-16: every showing goes to someone new). Their own stories always show.
  const key = viewerId ? `u:${viewerId}` : null;
  const fresh = key
    ? sql`(${article.authorId} = ${viewerId} or (
        not exists (select 1 from article_read r where r.article_id = ${article.id} and r.viewer_key = ${key})
        and not exists (
          select 1 from spotlight_impression si join spotlight_order so on so.id = si.order_id
          where so.article_id = ${article.id} and so.status = 'granted' and so.starts_at <= now() and so.ends_at > now()
            and si.viewer_key = ${key} and si.shows >= ${SPOTLIGHT_SHOW_CAP})))`
    : undefined;
  const rows = await selectCards(viewerId)
    .where(and(visibleWhere(), spotlightNow(), ...scope, fresh))
    .orderBy(sql`md5(${article.id}::text || ${seed})`)
    .limit(SPOTLIGHT_MAX);
  return rows.map((row) => toCard(row, viewerId));
}
const notSpotlit = (): SQL => sql`not ${spotlightNow()}`;
/** Editor's Picks minus the stories already shown as spotlights. */
const withoutSpotlit = (picks: ArticleCard[], spotlit: ArticleCard[]) =>
  picks.filter((pick) => !spotlit.some((spot) => spot.id === pick.id));
/** Without a visit seed (visitors): the order changes every hour, the same on every page within it. */
const hourSeed = () => new Date().toISOString().slice(0, 13);

/**
 * Puts the spotlights into one page of the feed: `organic` = the page's own stories, `offset` = how many of the feed's
 * own stories came before them. The j-th spotlight goes before own story SPOTLIGHT_FIRST + j·SPOTLIGHT_EVERY; on the
 * last page (`ended`) the ones whose slot was never reached follow at the end.
 */
function weaveSpotlights(organic: ArticleCard[], offset: number, spots: ArticleCard[], ended: boolean): ArticleCard[] {
  const slot = (j: number) => SPOTLIGHT_FIRST + j * SPOTLIGHT_EVERY;
  const out: ArticleCard[] = [];
  organic.forEach((story, i) => {
    spots.forEach((spot, j) => {
      if (slot(j) === offset + i) out.push(spot);
    });
    out.push(story);
  });
  if (ended) spots.forEach((spot, j) => slot(j) >= offset + organic.length && out.push(spot));
  return out;
}

/** How many of a chronological feed's own stories come before `cursor` (where its page starts). */
async function storiesBefore(conditions: SQL[], cursor: NonNullable<ReturnType<typeof decodeCursor>>): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(...conditions, sql`not (${beforeCursor(article.publishedAt, article.id, cursor, "uuid")})`));
  return row?.n ?? 0;
}

/**
 * Chronological feed. Latest: Editor's Picks lead page 1 and are left out of the chronological list
 * (so they appear exactly once); Following: plain chronological list of followed authors.
 */
/*
 * A fresh mix on every visit (owner 2026-10-05: "every refresh shows different articles"): Home's Latest and the
 * category pages can be read in a shuffled order — the stories of the last SHUFFLE_RECENT_DAYS first, then older ones,
 * each group in an order fixed by a seed the page picks (so one visit's pages follow on without repeats). Offset
 * pages over that order; the cursor is `s.<seed>.<offset>`.
 */
const SHUFFLE_RECENT_DAYS = 14;
const SEED = /^[a-z0-9]{6,32}$/i;
/**
 * `preferred`: the reader's languages (owner 2026-10-05) — their stories come first, then everyone else's. `then`: more
 * languages whose stories follow straight after (the Languages menu's extra picks), before everyone else's.
 */
export type Shuffle = { seed: string; offset: number; preferred?: PressLanguage[]; then?: PressLanguage[] };

/** The shuffle a request asks for: a `s.` cursor (next pages), or `shuffle=<seed>` on the first page; else null. */
export function readShuffle(cursor: string | undefined, seed: string | undefined): Shuffle | null {
  if (cursor?.startsWith("s.")) {
    const [, s, o] = cursor.split(".");
    return s && SEED.test(s) && o && /^\d{1,6}$/.test(o) ? { seed: s, offset: Number(o) } : null;
  }
  return !cursor && seed && SEED.test(seed) ? { seed, offset: 0 } : null;
}

/**
 * Preferred languages first, all of them, newest first — not shuffled, not taking turns (owner 2026-10-05: "show all
 * the Kannada and Hindi news, no mixing like 2 Kannada 1 Hindi, no shuffle"); then the `then` languages the same way;
 * then everything else in the fresh mix.
 */
const shuffledOrder = (seed: string, preferred: PressLanguage[] = [], then: PressLanguage[] = []) => {
  const older = sql`(${article.publishedAt} < now() - make_interval(days => ${SHUFFLE_RECENT_DAYS}))`;
  const mix = sql`md5(${article.id}::text || ${seed})`;
  const tiers = [preferred, then].filter((tier) => tier.length > 0);
  if (tiers.length === 0) return [older, mix];
  const tier = sql`case ${sql.join(
    tiers.map((languages, index) => sql`when ${inArray(article.language, languages)} then ${index}`),
    sql` `,
  )} else ${tiers.length} end`;
  const listed = sql`${tier} < ${tiers.length}`;
  return [
    tier,
    sql`case when ${listed} then ${article.publishedAt} end desc nulls last`,
    sql`case when ${listed} then ${article.id} end desc nulls last`,
    older,
    mix,
  ];
};

async function shuffledPage(conditions: SQL[], viewerId: string | null, shuffle: Shuffle, limit: number) {
  const rows = await selectCards(viewerId)
    .where(and(...conditions))
    .orderBy(...shuffledOrder(shuffle.seed, shuffle.preferred, shuffle.then))
    .limit(limit + 1)
    .offset(shuffle.offset);
  const items = rows.slice(0, limit).map((row) => toCard(row, viewerId));
  return { items, nextCursor: rows.length > limit ? `s.${shuffle.seed}.${shuffle.offset + limit}` : null };
}

/**
 * A logged-out visitor's Home (owner 2026-10-22: "old and latest articles mixed on top, then sign in to read more"):
 * the newest stories (the last VISITOR_RECENT_DAYS, newest first) take turns with older ones in an order fixed by the
 * day's seed — latest, older, latest, older… — so the few cards a visitor can read are half today's news and half the
 * archive, and the blurred ones after them the same; when one side runs out the other carries on. Offset pages over
 * that order, `s.<seed>.<offset>` cursors like the other shuffled feeds. Editor's Picks lead page 1, Spotlights are
 * woven in as usual.
 */
const VISITOR_RECENT_DAYS = 1;
const visitorMixOrder = (seed: string) => {
  const recent = sql`(${article.publishedAt} >= now() - make_interval(days => ${VISITOR_RECENT_DAYS}))`;
  return sql`case when ${recent}
    then (row_number() over (partition by ${recent} order by ${article.publishedAt} desc, ${article.id} desc) - 1) * 2
    else (row_number() over (partition by ${recent} order by md5(${article.id}::text || ${seed})) - 1) * 2 + 1 end`;
};

export async function listVisitorMix(opts: { shuffle: Shuffle; limit: number }): Promise<Page<ArticleCard>> {
  const { seed, offset } = opts.shuffle;
  const spotlit = await listSpotlit(null, seed);
  const picks = offset === 0 ? withoutSpotlit(await listEditorsPicks(null), spotlit) : [];
  const limit = Math.max(opts.limit - picks.length, 1);
  const rows = await selectCards(null)
    .where(and(visibleWhere(), isNull(article.pinnedAt), notSpotlit()))
    .orderBy(visitorMixOrder(seed))
    .limit(limit + 1)
    .offset(offset);
  const items = rows.slice(0, limit).map((row) => toCard(row, null));
  const nextCursor = rows.length > limit ? `s.${seed}.${offset + limit}` : null;
  const woven = weaveSpotlights(items, offset, spotlit, nextCursor === null);
  return { items: [...picks, ...woven], nextCursor };
}

export async function listFeed(opts: {
  tab: Exclude<FeedTab, "foryou">;
  viewerId: string | null;
  cursor: string | undefined;
  limit: number;
  /** Latest only: the shuffled order (readShuffle). */
  shuffle?: Shuffle | null;
}): Promise<Page<ArticleCard>> {
  if (opts.shuffle && opts.tab === "latest") {
    const preferred = opts.shuffle.preferred ?? [];
    const first = opts.shuffle.offset === 0;
    const spotlit = await listSpotlit(opts.viewerId, opts.shuffle.seed);
    if (preferred.length === 0) {
      const picks = first ? withoutSpotlit(await listEditorsPicks(opts.viewerId), spotlit) : [];
      const page = await shuffledPage(
        [visibleWhere(), isNull(article.pinnedAt), notSpotlit()],
        opts.viewerId,
        opts.shuffle,
        Math.max(opts.limit - picks.length, 1),
      );
      const woven = weaveSpotlights(page.items, opts.shuffle.offset, spotlit, page.nextCursor === null);
      return { items: [...picks, ...woven], nextCursor: page.nextCursor };
    }
    // A reader with languages: only picks in those lead page 1 (nothing else above their languages' news); the other
    // pinned stories take their place in the feed like any story. Every page leaves the same picks out.
    const picks = await listEditorsPicks(opts.viewerId, preferred);
    const shown = first ? withoutSpotlit(picks, spotlit) : [];
    const conditions = [visibleWhere(), notSpotlit(), ...(picks.length > 0 ? [notInArray(article.id, picks.map((p) => p.id))] : [])];
    const page = await shuffledPage(conditions, opts.viewerId, opts.shuffle, Math.max(opts.limit - shown.length, 1));
    const woven = weaveSpotlights(page.items, opts.shuffle.offset, spotlit, page.nextCursor === null);
    return { items: [...shown, ...woven], nextCursor: page.nextCursor };
  }
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [visibleWhere()];
  const cursorCondition = cursor ? beforeCursor(article.publishedAt, article.id, cursor, "uuid") : null;
  if (cursorCondition) conditions.push(cursorCondition);
  let picks: ArticleCard[] = [];
  let spotlit: ArticleCard[] = [];
  if (opts.tab === "following") {
    if (!opts.viewerId) return { items: [], nextCursor: null };
    conditions.push(
      inArray(
        article.authorId,
        db.select({ id: follow.followingId }).from(follow).where(eq(follow.followerId, opts.viewerId)),
      ),
    );
  } else {
    conditions.push(isNull(article.pinnedAt), notSpotlit());
    spotlit = await listSpotlit(opts.viewerId, hourSeed());
    if (!cursor) picks = withoutSpotlit(await listEditorsPicks(opts.viewerId), spotlit);
  }
  const offset = cursor && spotlit.length > 0 ? await storiesBefore(conditions.filter((condition) => condition !== cursorCondition), cursor) : 0;
  const limit = Math.max(opts.limit - picks.length, 1);
  const rows = await selectCards(opts.viewerId)
    .where(and(...conditions))
    .orderBy(descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(limit + 1);
  const page = paginate(
    rows.map((row) => toCard(row, opts.viewerId)),
    limit,
    cardCursor,
  );
  return { items: [...picks, ...weaveSpotlights(page.items, offset, spotlit, page.nextCursor === null)], nextCursor: page.nextCursor };
}

/** A category page (inside Karnataka, optionally one district): its stories newest first, no Editor's Picks. */
export async function listCategoryFeed(opts: {
  category: Category;
  district: string | null;
  viewerId: string | null;
  cursor: string | undefined;
  limit: number;
  /** The shuffled order (readShuffle). */
  shuffle?: Shuffle | null;
}): Promise<Page<ArticleCard>> {
  const scope: SQL[] = [eq(article.category, opts.category)];
  if (opts.district) scope.push(eq(article.district, opts.district));
  const conditions: SQL[] = [visibleWhere(), ...scope, notSpotlit()];
  // The category's spotlighted stories are woven in, one every few stories (weaveSpotlights).
  if (opts.shuffle) {
    const spotlit = await listSpotlit(opts.viewerId, opts.shuffle.seed, scope);
    const page = await shuffledPage(conditions, opts.viewerId, opts.shuffle, opts.limit);
    return { items: weaveSpotlights(page.items, opts.shuffle.offset, spotlit, page.nextCursor === null), nextCursor: page.nextCursor };
  }
  const cursor = decodeCursor(opts.cursor);
  const spotlit = await listSpotlit(opts.viewerId, hourSeed(), scope);
  const offset = cursor && spotlit.length > 0 ? await storiesBefore(conditions, cursor) : 0;
  if (cursor) conditions.push(beforeCursor(article.publishedAt, article.id, cursor, "uuid"));
  const limit = opts.limit;
  const rows = await selectCards(opts.viewerId)
    .where(and(...conditions))
    .orderBy(descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(limit + 1);
  const page = paginate(
    rows.map((row) => toCard(row, opts.viewerId)),
    limit,
    cardCursor,
  );
  return { items: weaveSpotlights(page.items, offset, spotlit, page.nextCursor === null), nextCursor: page.nextCursor };
}

/**
 * The languages a reader's feeds lead with (owner 2026-10-05): the ones they picked at sign-up / in Settings, else
 * (a reporter who never picked) their Press Pass languages; none for visitors.
 */
export async function readerLanguages(viewerId: string | null): Promise<PressLanguage[]> {
  if (!viewerId) return [];
  const [row] = await db
    .select({ picked: user.preferredLanguages, pass: pressPass.languages })
    .from(user)
    .leftJoin(pressPass, eq(pressPass.userId, user.id))
    .where(eq(user.id, viewerId))
    .limit(1);
  if (!row) return [];
  return row.picked.length > 0 ? row.picked : (row.pass ?? []);
}

/**
 * The Languages menu (owner 2026-10-05): the picked languages' stories first, then every other story (owner: "don't show
 * only those languages"). Of the picks, the reader's own languages (from their profile) lead and the extra ones follow
 * (owner: "my 3 languages first, then the one I ticked now") — each newest first; the rest in a fresh mix. Without a
 * shuffle seed (old links), one fixed mix.
 */
export async function listLanguageFeed(opts: {
  languages: PressLanguage[];
  viewerId: string | null;
  cursor: string | undefined;
  limit: number;
  shuffle?: Shuffle | null;
}): Promise<Page<ArticleCard>> {
  const shuffle = opts.shuffle ?? readShuffle(opts.cursor, "languages") ?? { seed: "languages", offset: 0 };
  const own = shuffle.preferred ?? (await readerLanguages(opts.viewerId));
  const first = opts.languages.filter((code) => own.includes(code));
  const extra = opts.languages.filter((code) => !own.includes(code));
  const tiers = first.length > 0 ? { preferred: first, then: extra } : { preferred: extra, then: [] };
  return shuffledPage([visibleWhere()], opts.viewerId, { ...shuffle, ...tiers }, opts.limit);
}

/**
 * Published articles of one author (profile grid). The author (and the Editor Desk) also get the
 * stories the desk hid, flagged with `hidden: true`.
 */
export async function listAuthorPublished(opts: {
  authorId: string;
  viewerId: string | null;
  cursor: string | undefined;
  limit: number;
  includeHidden?: boolean;
  /** The profile's "Members only" tab (owner 2026-10-14). */
  premiumOnly?: boolean;
}): Promise<Page<ArticleCard>> {
  const cursor = decodeCursor(opts.cursor);
  const visibility = opts.includeHidden ? (and(eq(article.status, "published"), isNotNull(user.username)) as SQL) : visibleWhere();
  const conditions: SQL[] = [visibility, eq(article.authorId, opts.authorId)];
  if (opts.premiumOnly) conditions.push(eq(article.premium, true));
  if (cursor) conditions.push(beforeCursor(article.publishedAt, article.id, cursor, "uuid"));
  const rows = await selectCards(opts.viewerId)
    .where(and(...conditions))
    .orderBy(descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(opts.limit + 1);
  return paginate(
    rows.map((row) => toCard(row, opts.viewerId)),
    opts.limit,
    cardCursor,
  );
}

/** A single publicly visible card (realtime `article.published`, API responses). */
export async function getPublishedCard(id: string, viewerId: string | null, executor: Executor = db): Promise<ArticleCard | null> {
  if (!isUuid(id)) return null;
  const [row] = await selectCards(viewerId, executor)
    .where(and(visibleWhere(), eq(article.id, id)))
    .limit(1);
  return row ? toCard(row, viewerId) : null;
}

/** Visible cards for `ids`, returned in the order of `ids` (missing / invisible ones are skipped). */
export async function listVisibleCardsByIds(ids: string[], viewerId: string | null): Promise<ArticleCard[]> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  const rows = await selectCards(viewerId).where(and(visibleWhere(), inArray(article.id, valid)));
  const byId = new Map(rows.map((row) => [row.id, toCard(row, viewerId)]));
  return valid.map((id) => byId.get(id)).filter((card): card is ArticleCard => card !== undefined);
}

/* ─────────────── Search ─────────────── */

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Instant search (stories): public stories whose headline contains `q` (headline prefixes first), then stories that
 * only mention it in their text; newest first within each group.
 */
export async function searchStories(q: string, viewerId: string | null, limit: number): Promise<ArticleCard[]> {
  const needle = q.toLowerCase();
  const contains = `%${escapeLike(needle)}%`;
  const rank = sql<number>`case
    when lower(${article.title}) like ${`${escapeLike(needle)}%`} then 0
    when lower(${article.title}) like ${contains} then 1
    else 2 end`;
  const rows = await selectCards(viewerId)
    .where(and(visibleWhere(), or(ilike(article.title, contains), ilike(article.bodyText, contains))))
    .orderBy(asc(rank), descNullsLast(article.publishedAt))
    .limit(limit);
  return rows.map((row) => toCard(row, viewerId));
}

/* ─────────────── Detail ─────────────── */

export type DetailViewer = { id: string; role: string } | null;

/**
 * Published article + body. Hidden stories and stories of suspended authors are returned only to
 * their author and the Editor Desk (with `hidden: true` when the desk hid it).
 */
async function getDetail(where: SQL, viewer: DetailViewer, executor: Executor = db, unlocked = false): Promise<ArticleDetail | null> {
  const viewerId = viewer?.id ?? null;
  const [row] = await executor
    .select({
      ...cardColumns(viewerId),
      bodyHtml: article.bodyHtml,
      editedAt: article.editedAt,
      authorSuspended: sql<boolean>`(${user.suspendedAt} is not null)`,
      articleImageUrl: article.articleImageUrl,
      articleImageWidth: article.articleImageWidth,
      articleImageHeight: article.articleImageHeight,
      articleImageBlur: article.articleImageBlur,
      articleVideoUrl: article.articleVideoUrl,
      articleVideoWidth: article.articleVideoWidth,
      articleVideoHeight: article.articleVideoHeight,
      articleVideoDurationMs: article.articleVideoDurationMs,
      membershipPrice: user.membershipPrice,
      dislikeCount: article.dislikeCount,
      blurb: article.blurb,
      subcategory: article.subcategory,
    })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(eq(article.status, "published"), isNotNull(user.username), where))
    .limit(1);
  if (!row) return null;
  const privileged = viewer !== null && (viewer.id === row.authorId || viewer.role === "admin");
  if ((row.hidden || row.authorSuspended) && !privileged) return null;
  // `unlocked` (a publisher site): read as the author would, so a premium story keeps its text.
  const card = toCard(row, unlocked ? row.authorId : viewerId);
  // Premium (owner 2026-10-14): the body only for the author, members and the Editor Desk.
  if (card.locked && viewer?.role === "admin") card.locked = false;
  return {
    ...card,
    bodyHtml: card.locked ? "" : (row.bodyHtml ?? ""),
    paywall: card.locked ? { priceInr: row.membershipPrice } : null,
    // No text at all for a locked premium story (owner 2026-10-14).
    blurb: card.locked ? null : row.blurb,
    subcategory: row.subcategory,
    dislikeCount: row.dislikeCount,
    editedAt: row.editedAt?.toISOString() ?? null,
    author: { ...card.author, bio: row.authorBio },
    articleMedia: toArticleMedia(row),
  };
}

type ArticleMediaColumns = Pick<
  ArticleRecord,
  | "articleImageUrl"
  | "articleImageWidth"
  | "articleImageHeight"
  | "articleImageBlur"
  | "articleVideoUrl"
  | "articleVideoWidth"
  | "articleVideoHeight"
  | "articleVideoDurationMs"
>;

/** The full article's own media, or null (stories from before it existed show their cover instead). */
function toArticleMedia(row: ArticleMediaColumns): ArticleMedia | null {
  if (!row.articleImageUrl) return null;
  const video = toVideo({
    videoUrl: row.articleVideoUrl,
    videoWidth: row.articleVideoWidth,
    videoHeight: row.articleVideoHeight,
    videoDurationMs: row.articleVideoDurationMs,
  });
  return { url: row.articleImageUrl, width: row.articleImageWidth, height: row.articleImageHeight, blur: row.articleImageBlur, video };
}

export function getPublishedDetailBySlug(slug: string, viewer: DetailViewer): Promise<ArticleDetail | null> {
  return getDetail(eq(article.slug, slug), viewer);
}

/** A publisher site's story (owner 2026-10-29): only `authorId`'s, and premium ones open in full there. */
export function getSiteStoryDetail(slug: string, authorId: string): Promise<ArticleDetail | null> {
  return getDetail(and(eq(article.slug, slug), eq(article.authorId, authorId)) as SQL, null, db, true);
}

/**
 * Where a short share link (`/s/<code>`) points: the slug of the publicly visible story with that code, or null
 * (unknown code, or the story is hidden / unpublished / waiting at the Review Desk / its author suspended). Codes are
 * lowercase; the caller lowercases and validates the input first.
 */
export async function findSlugByShortCode(code: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: article.slug })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(visibleWhere(), eq(article.shortCode, code)))
    .limit(1);
  return row?.slug ?? null;
}

export function getPublishedDetailById(id: string, viewer: DetailViewer, executor: Executor = db): Promise<ArticleDetail | null> {
  if (!isUuid(id)) return Promise.resolve(null);
  return getDetail(eq(article.id, id), viewer, executor);
}

/** Up to `limit` other visible articles by the same author. */
export async function listMoreFromAuthor(authorId: string, excludeId: string, viewerId: string | null, limit = 3): Promise<ArticleCard[]> {
  const rows = await selectCards(viewerId)
    .where(and(visibleWhere(), eq(article.authorId, authorId), ne(article.id, excludeId)))
    .orderBy(descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(limit);
  return rows.map((row) => toCard(row, viewerId));
}

/* ─────────────── Drafts / owner views ─────────────── */

/** The owner's drafts plus stories waiting at the Review Desk (newest edit first). */
export async function listDrafts(opts: { authorId: string; cursor: string | undefined; limit: number }): Promise<Page<DraftCard>> {
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [eq(article.authorId, opts.authorId), inArray(article.status, ["draft", "in_review"])];
  if (cursor) conditions.push(beforeCursor(article.updatedAt, article.id, cursor, "uuid"));
  const rows = await db
    .select({
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      coverUrl: article.coverUrl,
      coverBlur: article.coverBlur,
      updatedAt: article.updatedAt,
      status: article.status,
      returnedAt: article.returnedAt,
      reviewNote: article.reviewNote,
    })
    .from(article)
    .where(and(...conditions))
    .orderBy(descNullsLast(article.updatedAt), descNullsLast(article.id))
    .limit(opts.limit + 1);
  const page = paginate(rows, opts.limit, (row) => ({ at: row.updatedAt, id: row.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((row) => ({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      coverUrl: row.coverUrl,
      coverBlur: row.coverBlur,
      updatedAt: row.updatedAt.toISOString(),
      status: row.status === "in_review" ? "in_review" : "draft",
      returned: row.status === "draft" && row.returnedAt !== null,
      reviewNote: row.status === "draft" && row.returnedAt !== null ? row.reviewNote : null,
    })),
  };
}

/** Raw article row if it exists and belongs to `ownerId` (drafts never leak to others). */
export async function findOwnedArticle(id: string, ownerId: string, executor: Executor = db): Promise<ArticleRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await executor
    .select()
    .from(article)
    .where(and(eq(article.id, id), eq(article.authorId, ownerId)))
    .limit(1);
  return row ?? null;
}

export async function findArticleById(id: string, executor: Executor = db): Promise<ArticleRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await executor.select().from(article).where(eq(article.id, id)).limit(1);
  return row ?? null;
}

export function toDraftDetail(row: ArticleRecord): DraftDetail {
  return {
    id: row.id,
    title: row.title,
    bodyHtml: row.bodyHtml,
    linkUrl: row.linkUrl,
    cover:
      row.coverUrl && row.coverKey
        ? { url: row.coverUrl, key: row.coverKey, width: row.coverWidth, height: row.coverHeight, blurDataUrl: row.coverBlur }
        : null,
    video: (() => {
      const video = toVideo(row);
      return video && row.videoKey ? { ...video, key: row.videoKey } : null;
    })(),
    articleImage: row.articleImageUrl && row.articleImageKey
      ? {
          url: row.articleImageUrl,
          key: row.articleImageKey,
          width: row.articleImageWidth,
          height: row.articleImageHeight,
          blurDataUrl: row.articleImageBlur,
        }
      : null,
    articleVideo: (() => {
      const video = toArticleMedia(row)?.video;
      return video && row.articleVideoKey ? { ...video, key: row.articleVideoKey } : null;
    })(),
    category: row.category,
    district: row.district,
    language: row.language,
    template: row.template,
    posterFrame: toPosterFrame(row),
    premium: row.premium,
    subcategory: row.subcategory,
    blurb: row.blurb,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toArticleReview(row: ArticleRecord): ArticleReview | null {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  if (row.status === "in_review") {
    return { state: "in_review", note: null, submittedAt: iso(row.submittedAt), returnedAt: null, reviewedAt: null };
  }
  if (row.status === "draft" && row.returnedAt) {
    return { state: "returned", note: row.reviewNote, submittedAt: iso(row.submittedAt), returnedAt: iso(row.returnedAt), reviewedAt: iso(row.reviewedAt) };
  }
  return null;
}

export function toOwnedArticle(row: ArticleRecord): OwnedArticle {
  return {
    ...toDraftDetail(row),
    status: row.status,
    slug: row.slug,
    review: toArticleReview(row),
    hidden: row.status === "published" && row.hiddenAt ? { at: row.hiddenAt.toISOString(), reason: row.hiddenReason } : null,
  };
}

/* ─────────────── Stats ─────────────── */

export async function getStats(id: string, executor: Executor = db): Promise<ArticleStats | null> {
  if (!isUuid(id)) return null;
  const [row] = await executor
    .select({ id: article.id, viewCount: article.viewCount, likeCount: article.likeCount, shareCount: article.shareCount, commentCount: article.commentCount })
    .from(article)
    .where(and(eq(article.id, id), eq(article.status, "published")))
    .limit(1);
  return row ?? null;
}

/** Author id of a publicly visible article, or null (missing, draft, in review, hidden, suspended author). */
export async function findVisibleAuthor(id: string, executor: Executor = db): Promise<string | null> {
  if (!isUuid(id)) return null;
  const [row] = await executor
    .select({ authorId: article.authorId })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(visibleWhere(), eq(article.id, id)))
    .limit(1);
  return row?.authorId ?? null;
}

/** A publicly visible story's id and title (sharing it in a chat), or null. */
export async function findVisibleArticle(id: string, executor: Executor = db): Promise<{ id: string; title: string } | null> {
  if (!isUuid(id)) return null;
  const [row] = await executor
    .select({ id: article.id, title: article.title })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(visibleWhere(), eq(article.id, id)))
    .limit(1);
  return row ? { id: row.id, title: row.title ?? "Untitled story" } : null;
}
