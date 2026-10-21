/**
 * Idempotent demo data: 6 onboarded publishers (Verified Reporters with Press Passes), 24 published stories
 * across world / tech / sports / business / science / culture (generated abstract covers), a few drafts,
 * follows, likes and views — plus the roles demo (SPEC §3.11, scripts/seed-roles.ts): a Trainee reporter with
 * an approved, an in-review and a returned story, a Reader, the demo Editor Desk account
 * admin.demo@demo.webnews.local, a pending Spotlight request and a few open reader reports.
 *
 * TURNED OFF (owner decision 2026-09-25): without `--force-seed` the script does nothing.
 *   npm run db:seed -- --force-seed           → creates whatever is missing; safe to run any number of times
 *   npm run db:seed -- --force-seed --reset   → first removes ONLY @demo.webnews.local and @test.webnews.local users
 *                                  (and everything they own), then seeds fresh (publish times relative to now)
 *
 * Real accounts are never touched. Demo data is for local development only: the script refuses to create it when
 * NODE_ENV=production or FRONTEND_URL isn't localhost (`--reset` there only removes demo/test accounts).
 * Every demo account's password is "webnews-demo-2026" — except the demo Editor Desk, which gets its own random
 * password, printed once (new one any time: `npm run db:demo-admin-password`).
 */
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { DEMO_EMAIL_DOMAIN, TEST_EMAIL_DOMAIN, purgeUsers } from "../src/db/purge.js";
import { account, article, articleLike, articleView, follow, user } from "../src/db/schema.js";
import { extractDomain, htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { fromBackendRoot } from "../src/lib/paths.js";
import { sanitizeArticleHtml } from "../src/lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import { POSTER_TEMPLATE_VALUES, TERMS_VERSION, type Category as StoryCategory } from "../src/shared/contracts.js";
import { DEMO_ADMIN_EMAIL, rotateDemoAdminPassword } from "./demo-admin.js";
import { databaseName, databaseUrl, demoSeedRefusal } from "./lib.js";
import { renderAvatar, renderCover } from "./seed-art.js";
import { seedRoles } from "./seed-roles.js";
import { DEMO_ADMIN, DEMO_READER, DEMO_TRAINEE } from "./seed-roles-data.js";
import {
  DEMO_ARTICLES,
  DEMO_DRAFTS,
  DEMO_PASSWORD,
  DEMO_PUBLISHERS,
  articleBlocks,
  renderBody,
  unmatchedExtensions,
  type Block,
  type DemoArticle,
  type DemoPublisher,
} from "./seed-data.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Who follows whom, by index into DEMO_PUBLISHERS. */
const FOLLOWS: number[][] = [[1, 2, 4], [0, 3, 5], [0, 1, 4, 5], [2, 5], [0, 1, 2, 3], [3, 4]];

type Publisher = { id: string; username: string; index: number };
type SeededArticle = { id: string; index: number; authorIndex: number; publishedAt: Date };

const emailFor = (username: string) => `${username}@${DEMO_EMAIL_DOMAIN}`;
const newId = () => generateRandomString(32, "a-z", "A-Z", "0-9");

/** Runs `fn` over `items` with at most `limit` in flight (image rendering is CPU-heavy). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function storeAvatar(index: number, userId: string): Promise<string> {
  const avatar = await processImage(await renderAvatar(index), "avatar");
  return storage.put(newImageKey("avatar", userId), avatar.buffer, avatar.contentType);
}

async function ensurePublisher(p: Pick<DemoPublisher, "username" | "name" | "bio">, index: number, passwordHash: string): Promise<Publisher | null> {
  const email = emailFor(p.username);
  const [existing] = await db.select({ id: user.id, username: user.username, image: user.image }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    if (!existing.image) await db.update(user).set({ image: await storeAvatar(index, existing.id) }).where(eq(user.id, existing.id));
    return { id: existing.id, username: existing.username ?? p.username, index };
  }

  const [holder] = await db.select({ id: user.id }).from(user).where(eq(user.username, p.username)).limit(1);
  if (holder) {
    console.warn(`[seed] @${p.username} already belongs to a non-demo account — skipping this publisher`);
    return null;
  }

  const id = newId();
  const joined = new Date(Date.now() - (45 + index * 11) * DAY);
  const image = await storeAvatar(index, id);
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id,
      name: p.name,
      email,
      emailVerified: true,
      image,
      username: p.username,
      bio: p.bio,
      onboardedAt: joined,
      termsAcceptedAt: joined,
      termsVersion: TERMS_VERSION,
      createdAt: joined,
      updatedAt: joined,
    });
    await tx.insert(account).values({ id: newId(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: joined, updatedAt: joined });
  });
  return { id, username: p.username, index };
}

function articleFields(body: Block[]) {
  const bodyHtml = sanitizeArticleHtml(renderBody(body));
  const bodyText = htmlToText(bodyHtml);
  return {
    bodyHtml: bodyHtml || null,
    bodyText: bodyText || null,
    excerpt: bodyText ? makeExcerpt(htmlToExcerptText(bodyHtml)) : null,
    readingMinutes: bodyText ? readingMinutes(bodyText) : null,
  };
}

async function storeCover(index: number, authorId: string) {
  const cover = await processImage(await renderCover(index % 6, index + 1), "cover");
  const coverKey = newImageKey("cover", authorId);
  const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
  return { coverUrl, coverKey, coverWidth: cover.width, coverHeight: cover.height, coverBlur: cover.blurDataUrl };
}

/** Story category of each demo desk's stories (the desks' topics predate story categories). */
const STORY_CATEGORY: Record<DemoPublisher["category"], StoryCategory> = {
  world: "world",
  tech: "technology",
  sports: "sports",
  business: "business",
  science: "technology",
  culture: "entertainment",
};

async function ensureArticle(a: DemoArticle, index: number, publishers: Map<string, Publisher>): Promise<(SeededArticle & { created: boolean }) | null> {
  const author = publishers.get(a.author);
  if (!author) return null;
  const [existing] = await db
    .select({ id: article.id, publishedAt: article.publishedAt })
    .from(article)
    .where(and(eq(article.authorId, author.id), eq(article.title, a.title), eq(article.status, "published")))
    .limit(1);
  if (existing?.publishedAt) return { id: existing.id, index, authorIndex: author.index, publishedAt: existing.publishedAt, created: false };

  const publishedAt = new Date(Date.now() - a.hoursAgo * HOUR);
  const values = {
    authorId: author.id,
    status: "published" as const,
    title: a.title,
    ...articleFields(articleBlocks(a)),
    ...(await storeCover(index, author.id)),
    linkUrl: a.link ?? null,
    linkDomain: extractDomain(a.link),
    category: STORY_CATEGORY[DEMO_PUBLISHERS.find((p) => p.username === a.author)?.category ?? "world"],
    // Every poster design shows up in the reel (and each desk uses several).
    template: POSTER_TEMPLATE_VALUES[index % POSTER_TEMPLATE_VALUES.length],
    shareCount: a.shares,
    createdAt: new Date(publishedAt.getTime() - 35 * MINUTE),
    updatedAt: publishedAt,
    publishedAt,
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [row] = await db
        .insert(article)
        .values({ ...values, slug: makeSlug(a.title), shortCode: makeShortCode() })
        .returning({ id: article.id });
      if (!row) throw new Error("insert returned nothing");
      return { id: row.id, index, authorIndex: author.index, publishedAt, created: true };
    } catch (error) {
      if (isLinkCollision(error)) continue;
      throw error;
    }
  }
  throw new Error(`Could not create a unique slug for "${a.title}"`);
}

async function ensureDrafts(publishers: Map<string, Publisher>): Promise<number> {
  let created = 0;
  for (const [i, d] of DEMO_DRAFTS.entries()) {
    const author = publishers.get(d.author);
    if (!author) continue;
    const titleMatch = d.title === null ? isNull(article.title) : eq(article.title, d.title);
    const [existing] = await db.select({ id: article.id }).from(article).where(and(eq(article.authorId, author.id), eq(article.status, "draft"), titleMatch)).limit(1);
    if (existing) continue;
    const updatedAt = new Date(Date.now() - (3 + i * 5) * HOUR);
    await db.insert(article).values({
      authorId: author.id,
      status: "draft",
      title: d.title,
      ...articleFields(d.body),
      ...(d.withCover ? await storeCover(100 + i, author.id) : {}),
      createdAt: new Date(updatedAt.getTime() - DAY),
      updatedAt,
    });
    created++;
  }
  return created;
}

async function ensureFollows(list: Array<Publisher | null>): Promise<void> {
  const rows = FOLLOWS.flatMap((targets, from) =>
    targets.map((to, n) => ({ from: list[from], to: list[to], createdAt: new Date(Date.now() - (20 - from - n) * DAY) })),
  )
    .filter((r): r is { from: Publisher; to: Publisher; createdAt: Date } => Boolean(r.from && r.to))
    .map((r) => ({ followerId: r.from.id, followingId: r.to.id, createdAt: r.createdAt }));
  if (rows.length > 0) await db.insert(follow).values(rows).onConflictDoNothing();
}

/** 2–5 fellow publishers like each story (never the author); each liker also counts as a viewer. */
async function ensureLikesAndViews(articles: SeededArticle[], list: Array<Publisher | null>): Promise<void> {
  for (const a of articles) {
    const others = list.filter((p): p is Publisher => p !== null && p.index !== a.authorIndex);
    const rotated = [...others.slice(a.index % others.length), ...others.slice(0, a.index % others.length)];
    const likers = rotated.slice(0, 2 + (a.index % 4));
    const at = (n: number) => new Date(Math.min(Date.now(), a.publishedAt.getTime() + (n + 1) * 7 * MINUTE));
    if (likers.length > 0) {
      await db.insert(articleLike).values(likers.map((p, n) => ({ userId: p.id, articleId: a.id, createdAt: at(n) }))).onConflictDoNothing();
      await db.insert(articleView).values(likers.map((p, n) => ({ articleId: a.id, viewerKey: `u:${p.id}`, createdAt: at(n) }))).onConflictDoNothing();
    }

    // Anonymous readers: a fixed number per story and deterministic viewer keys, so re-running
    // the seed never inflates the numbers.
    const hoursAgo = DEMO_ARTICLES[a.index]?.hoursAgo ?? 24;
    const readers = Math.round(60 + Math.min(hoursAgo, 72) * 28 + ((a.index * 137) % 320));
    await db.execute(sql`
      insert into ${articleView} (article_id, viewer_key, created_at)
      select ${a.id}::uuid,
             'a:' || (md5('webnews-demo-reader-' || g::text)::uuid)::text,
             ${a.publishedAt.toISOString()}::timestamptz + random() * (now() - ${a.publishedAt.toISOString()}::timestamptz)
      from generate_series(1, ${readers}) as g
      on conflict do nothing
    `);
  }
}

/** Counters = the rows that back them (keeps demo numbers consistent with likes/views tables). */
async function recount(authorIds: string[]): Promise<void> {
  if (authorIds.length === 0) return;
  await db
    .update(article)
    .set({
      viewCount: sql`(select count(*)::int from ${articleView} v where v.article_id = ${article.id})`,
      likeCount: sql`(select count(*)::int from ${articleLike} l where l.article_id = ${article.id})`,
    })
    .where(inArray(article.authorId, authorIds));
}

/** Owner decision 2026-09-25: no more seeding — the existing stories are enough. Only runs with this flag. */
const FORCE_FLAG = "--force-seed";

async function main(): Promise<void> {
  if (!process.argv.includes(FORCE_FLAG)) {
    console.log(
      `[seed] Seeding is turned off (owner decision 2026-09-25): no demo stories or accounts are created or reset, and the ` +
        `existing content stays as it is. To run it anyway on purpose: npm run db:seed -- ${FORCE_FLAG}`,
    );
    return;
  }
  const reset = process.argv.includes("--reset");
  const orphans = unmatchedExtensions();
  if (orphans.length > 0) throw new Error(`seed-data: extended sections for unknown titles: ${orphans.join(" | ")}`);
  console.log(`[seed] database: ${databaseName(databaseUrl())} · storage: ${storage.kind}`);

  if (reset) {
    const removed = await purgeUsers({ emailDomains: [DEMO_EMAIL_DOMAIN, TEST_EMAIL_DOMAIN] }, { extraLocalDirs: [fromBackendRoot(".data/test-uploads")] });
    console.log(`[seed] --reset: removed ${removed.users} demo/test user(s) and ${removed.articles} of their article(s)`);
  }
  const refusal = demoSeedRefusal();
  if (refusal) {
    console.error(`[seed] refusing to create demo data: ${refusal}. Demo accounts (known passwords, a demo Editor Desk) are for local development only.`);
    process.exitCode = reset ? 0 : 1;
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const list: Array<Publisher | null> = [];
  for (const [i, p] of DEMO_PUBLISHERS.entries()) list.push(await ensurePublisher(p, i, passwordHash));
  const publishers = new Map(list.filter((p): p is Publisher => p !== null).map((p) => [p.username, p]));

  const seeded = (await mapLimit(DEMO_ARTICLES, 4, (a, i) => ensureArticle(a, i, publishers))).filter(
    (a): a is SeededArticle & { created: boolean } => a !== null,
  );
  const drafts = await ensureDrafts(publishers);
  await ensureFollows(list);
  await ensureLikesAndViews(seeded, list);
  await recount([...publishers.values()].map((p) => p.id));

  const roles = await seedRoles({
    publishers,
    ensureUser: (person, avatarIndex) => ensurePublisher(person, avatarIndex, passwordHash),
    storeCover,
    articleFields,
    recount,
  });

  const adminPassword = roles.admin ? await rotateDemoAdminPassword() : null;

  const createdCount = seeded.filter((a) => a.created).length;
  console.log(`[seed] publishers: ${publishers.size} · stories: ${seeded.length} (${createdCount} new) · new drafts: ${drafts}`);
  console.log(
    `[seed] roles: press passes issued/completed ${roles.passes} · new Trainee stories ${roles.traineeStories} · new flags ${roles.flags} · ` +
      `new pending Spotlight ${roles.spotlight ? 1 : 0}`,
  );
  console.log(`\n[seed] Demo logins (password: ${DEMO_PASSWORD}, except the Editor Desk)`);
  const row = (username: string, name: string, role: string) => console.log(`  ${emailFor(username).padEnd(38)} ${username.padEnd(17)} ${name.padEnd(18)} ${role}`);
  for (const p of DEMO_PUBLISHERS) if (publishers.has(p.username)) row(p.username, p.name, "Reporter · Verified");
  if (roles.trainee) row(DEMO_TRAINEE.username, DEMO_TRAINEE.name, "Reporter · Trainee");
  if (roles.reader) row(DEMO_READER.username, DEMO_READER.name, "Reader");
  if (roles.admin) row(DEMO_ADMIN.username, DEMO_ADMIN.name, "Editor Desk (admin)");
  if (adminPassword) {
    console.log(`\n[seed] ${DEMO_ADMIN_EMAIL} password (shown once): ${adminPassword}`);
  } else if (roles.admin) {
    console.log(`\n[seed] ${DEMO_ADMIN_EMAIL} keeps its own password (new one: npm run db:demo-admin-password)`);
  }
}

try {
  await main();
} catch (error) {
  console.error("[seed] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
