/**
 * Roles part of `npm run db:seed` (SPEC §3.11). Idempotent like the rest of the seed: it only creates
 * what is missing and never overrides what the Editor Desk changed since (levels, revocations, resolved
 * flags, decided Spotlight requests). Touches demo accounts only.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { article, articleFlag, articleLike, articleSave, articleView, follow, pressPass, spotlightOrder, spotlightPackage, user, type ArticleRecord } from "../src/db/schema.js";
import { writeAudit } from "../src/lib/audit.js";
import { isUniqueViolation } from "../src/lib/errors.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newPassNumber } from "../src/queries/press-pass.js";
import { POSTER_TEMPLATE_VALUES, type ReporterLevel } from "../src/shared/contracts.js";
import type { Block } from "./seed-data.js";
import {
  DEMO_ADMIN,
  DEMO_FLAGS,
  DEMO_PRESS,
  DEMO_READER,
  DEMO_SPOTLIGHT,
  DEMO_TRAINEE,
  READER_FOLLOWS,
  READER_SAVES,
  TRAINEE_STORIES,
  type DemoPerson,
  type DemoPress,
  type TraineeStory,
} from "./seed-roles-data.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type SeedUser = { id: string; username: string };

type CoverFields = Pick<ArticleRecord, "coverUrl" | "coverKey" | "coverWidth" | "coverHeight" | "coverBlur">;
type BodyFields = Pick<ArticleRecord, "bodyHtml" | "bodyText" | "excerpt" | "readingMinutes">;

export type RoleSeedContext = {
  /** Demo publishers by username. */
  publishers: Map<string, SeedUser>;
  /** Creates (or finds) an onboarded demo account `<username>@demo.webnews.local`. */
  ensureUser: (person: DemoPerson, avatarIndex: number) => Promise<SeedUser | null>;
  storeCover: (index: number, authorId: string) => Promise<CoverFields>;
  articleFields: (body: Block[]) => BodyFields;
  /** Recomputes view/like counters of these authors' stories from the event rows. */
  recount: (authorIds: string[]) => Promise<void>;
};

export type RoleSeedSummary = {
  admin: SeedUser | null;
  trainee: SeedUser | null;
  reader: SeedUser | null;
  passes: number;
  traineeStories: number;
  flags: number;
  spotlight: boolean;
};

/* ─────────────── Press Passes ─────────────── */

/**
 * Issues a pass with the demo details, or completes a pass that has none yet (accounts migrated to
 * Verified Reporters before passes had regions: `WN-IN-…`; passes issued before verification: no mobile).
 * Returns true when it changed.
 */
async function ensurePass(holder: SeedUser, press: DemoPress, level: ReporterLevel, approvedCount: number): Promise<boolean> {
  const [person] = await db.select({ name: user.name, role: user.role, createdAt: user.createdAt }).from(user).where(eq(user.id, holder.id)).limit(1);
  if (!person) return false;
  const [existing] = await db.select().from(pressPass).where(eq(pressPass.userId, holder.id)).limit(1);
  const now = new Date();
  const details = {
    mobile: press.mobile,
    reporterType: press.reporterType,
    outlet: press.outlet,
    experience: press.experience,
    state: press.state,
    district: press.district,
    city: press.city,
    languages: press.languages,
    about: press.about,
    links: [] as string[],
    updatedAt: now,
  };

  if (existing && existing.mobile && existing.state) return false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.transaction(async (tx) => {
        if (existing) {
          await tx
            .update(pressPass)
            .set({
              ...details,
              ...(existing.passNumber.startsWith("WN-IN-") ? { passNumber: newPassNumber(press.state) } : {}),
              ...(existing.pledgeSignedAt ? {} : { pledgeSignedAt: now, pledgeSignature: person.name }),
            })
            .where(eq(pressPass.userId, holder.id));
          return;
        }
        const issuedAt = new Date(Math.max(person.createdAt.getTime() + DAY, now.getTime() - 30 * DAY));
        await tx.insert(pressPass).values({
          userId: holder.id,
          passNumber: newPassNumber(press.state),
          ...details,
          pledgeSignedAt: issuedAt,
          pledgeSignature: person.name,
          level,
          approvedCount,
          issuedAt,
        });
        if (person.role === "reader") await tx.update(user).set({ role: "reporter", reporterLevel: level }).where(eq(user.id, holder.id));
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error, "press_pass_pass_number_unique")) continue;
      throw error;
    }
  }
  throw new Error(`Could not issue a unique pass number for @${holder.username}`);
}

/* ─────────────── Trainee stories (every Review Desk state) ─────────────── */

async function ensureTraineeStory(
  ctx: RoleSeedContext,
  trainee: SeedUser,
  admin: SeedUser | null,
  story: TraineeStory,
  index: number,
): Promise<{ id: string; created: boolean; publishedAt: Date | null }> {
  const [existing] = await db
    .select({ id: article.id, publishedAt: article.publishedAt })
    .from(article)
    .where(and(eq(article.authorId, trainee.id), eq(article.title, story.title)))
    .limit(1);
  if (existing) return { id: existing.id, created: false, publishedAt: existing.publishedAt };

  const submittedAt = new Date(Date.now() - story.hoursAgo * HOUR);
  const decidedAt = new Date(submittedAt.getTime() + 2 * HOUR);
  const base = {
    authorId: trainee.id,
    title: story.title,
    ...ctx.articleFields(story.body),
    ...(await ctx.storeCover(200 + index, trainee.id)),
    // Ward Watch covers the wards of Mysuru.
    category: "karnataka" as const,
    district: "Mysuru",
    // The reporter's pick when submitting: the Review Desk shows it on the card and in the preview, the reel once the
    // story is approved. Varied so the demo covers more designs; set on creation only (existing stories are kept).
    template: POSTER_TEMPLATE_VALUES[(index + 3) % POSTER_TEMPLATE_VALUES.length],
    createdAt: new Date(submittedAt.getTime() - 50 * MINUTE),
    submittedAt,
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        let values: typeof article.$inferInsert;
        if (story.state === "published") {
          values = {
            ...base,
            status: "published",
            slug: makeSlug(story.title),
            shortCode: makeShortCode(),
            publishedAt: decidedAt,
            updatedAt: decidedAt,
            reviewedBy: admin?.id ?? null,
            reviewedAt: decidedAt,
            reviewNote: story.note ?? null,
          };
        } else if (story.state === "in_review") {
          values = { ...base, status: "in_review", updatedAt: submittedAt };
        } else {
          values = {
            ...base,
            status: "draft",
            updatedAt: decidedAt,
            returnedAt: decidedAt,
            reviewedBy: admin?.id ?? null,
            reviewedAt: decidedAt,
            reviewNote: story.note ?? "Please add more detail.",
          };
        }
        const [row] = await tx.insert(article).values(values).returning({ id: article.id, publishedAt: article.publishedAt });
        if (!row) throw new Error("insert returned nothing");
        if (admin && story.state !== "in_review") {
          await writeAudit(tx, {
            actorId: admin.id,
            action: story.state === "published" ? "review.approve" : "review.return",
            targetType: "article",
            targetId: row.id,
            targetLabel: story.title,
            meta: { note: story.note ?? null },
          });
        }
        return { id: row.id, created: true, publishedAt: row.publishedAt };
      });
    } catch (error) {
      if (isLinkCollision(error)) continue;
      throw error;
    }
  }
  throw new Error(`Could not create a unique slug for "${story.title}"`);
}

/** Engagement on the Trainee's approved story: a few publishers like it, anonymous readers view it. */
async function engageTraineeStory(ctx: RoleSeedContext, storyId: string, publishedAt: Date, trainee: SeedUser): Promise<void> {
  const likers = ["harbor.ledger", "market.pulse"].map((u) => ctx.publishers.get(u)).filter((p): p is SeedUser => Boolean(p));
  const at = (n: number) => new Date(Math.min(Date.now(), publishedAt.getTime() + (n + 1) * 11 * MINUTE));
  if (likers.length > 0) {
    await db.insert(articleLike).values(likers.map((p, n) => ({ userId: p.id, articleId: storyId, createdAt: at(n) }))).onConflictDoNothing();
    await db.insert(articleView).values(likers.map((p, n) => ({ articleId: storyId, viewerKey: `u:${p.id}`, createdAt: at(n) }))).onConflictDoNothing();
  }
  await db.execute(sql`
    insert into ${articleView} (article_id, viewer_key, created_at)
    select ${storyId}::uuid,
           'a:' || (md5('webnews-demo-trainee-reader-' || g::text)::uuid)::text,
           ${publishedAt.toISOString()}::timestamptz + random() * (now() - ${publishedAt.toISOString()}::timestamptz)
    from generate_series(1, 140) as g
    on conflict do nothing
  `);
  await ctx.recount([trainee.id]);
}

/* ─────────────── Spotlight, flags, reader activity ─────────────── */

/** Newest publicly visible story of an author. */
async function newestStory(authorId: string): Promise<{ id: string; title: string | null } | null> {
  const [row] = await db
    .select({ id: article.id, title: article.title })
    .from(article)
    .where(and(eq(article.authorId, authorId), eq(article.status, "published"), isNull(article.hiddenAt)))
    .orderBy(desc(article.publishedAt))
    .limit(1);
  return row ?? null;
}

/** One pending Spotlight request (only when the story never had one — a decided request stays decided). */
async function ensurePendingSpotlight(ctx: RoleSeedContext): Promise<boolean> {
  const reporter = ctx.publishers.get(DEMO_SPOTLIGHT.author);
  if (!reporter) return false;
  const story = await newestStory(reporter.id);
  if (!story) return false;
  const [already] = await db.select({ id: spotlightOrder.id }).from(spotlightOrder).where(eq(spotlightOrder.articleId, story.id)).limit(1);
  if (already) return false;
  const packages = await db.select().from(spotlightPackage).where(eq(spotlightPackage.active, true)).orderBy(spotlightPackage.sort);
  const pkg = packages.find((p) => p.hours === DEMO_SPOTLIGHT.packageHours) ?? packages[0];
  if (!pkg) return false;
  await db.insert(spotlightOrder).values({
    articleId: story.id,
    reporterId: reporter.id,
    packageId: pkg.id,
    packageName: pkg.name,
    hours: pkg.hours,
    priceInr: pkg.priceInr,
    status: "pending",
    provider: "manual",
    createdAt: new Date(Date.now() - 25 * MINUTE),
  });
  return true;
}

async function ensureFlags(people: Map<string, SeedUser>): Promise<number> {
  let created = 0;
  for (const [i, f] of DEMO_FLAGS.entries()) {
    const by = people.get(f.by);
    const author = people.get(f.storyAuthor);
    if (!by || !author || by.id === author.id) continue;
    const story = await newestStory(author.id);
    if (!story) continue;
    // Any earlier report (open or resolved by the desk) counts: re-running the seed never reopens a case.
    const [already] = await db
      .select({ id: articleFlag.id })
      .from(articleFlag)
      .where(and(eq(articleFlag.articleId, story.id), eq(articleFlag.userId, by.id)))
      .limit(1);
    if (already) continue;
    await db.insert(articleFlag).values({ articleId: story.id, userId: by.id, reason: f.reason, note: f.note, createdAt: new Date(Date.now() - (i + 1) * 37 * MINUTE) });
    created++;
  }
  return created;
}

async function ensureReaderActivity(reader: SeedUser, people: Map<string, SeedUser>): Promise<void> {
  const follows = READER_FOLLOWS.map((u) => people.get(u)).filter((p): p is SeedUser => Boolean(p));
  if (follows.length > 0) {
    await db
      .insert(follow)
      .values(follows.map((p, n) => ({ followerId: reader.id, followingId: p.id, createdAt: new Date(Date.now() - (6 - n) * DAY) })))
      .onConflictDoNothing();
  }
  for (const [n, username] of READER_SAVES.entries()) {
    const author = people.get(username);
    const story = author ? await newestStory(author.id) : null;
    if (story) await db.insert(articleSave).values({ userId: reader.id, articleId: story.id, createdAt: new Date(Date.now() - (n + 1) * HOUR) }).onConflictDoNothing();
  }
}

/* ─────────────── Entry point ─────────────── */

export async function seedRoles(ctx: RoleSeedContext): Promise<RoleSeedSummary> {
  // Demo Editor Desk (set directly — ADMIN_EMAILS only applies to real sign-ups / sign-ins).
  const admin = await ctx.ensureUser(DEMO_ADMIN, 6);
  if (admin) await db.update(user).set({ role: "admin" }).where(and(eq(user.id, admin.id), inArray(user.role, ["reader", "reporter"])));

  let passes = 0;
  for (const [username, press] of Object.entries(DEMO_PRESS)) {
    const publisher = ctx.publishers.get(username);
    if (!publisher) continue;
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(article)
      .where(and(eq(article.authorId, publisher.id), eq(article.status, "published")));
    if (await ensurePass(publisher, press, "verified", n)) passes++;
  }

  const trainee = await ctx.ensureUser(DEMO_TRAINEE, 7);
  let traineeStories = 0;
  if (trainee) {
    const approved = TRAINEE_STORIES.filter((s) => s.state === "published").length;
    if (await ensurePass(trainee, DEMO_TRAINEE.press, "trainee", approved)) passes++;
    for (const [i, story] of TRAINEE_STORIES.entries()) {
      const result = await ensureTraineeStory(ctx, trainee, admin, story, i);
      if (result.created) traineeStories++;
      if (result.created && story.state === "published" && result.publishedAt) await engageTraineeStory(ctx, result.id, result.publishedAt, trainee);
    }
  }

  const reader = await ctx.ensureUser(DEMO_READER, 8);
  const people = new Map(ctx.publishers);
  for (const extra of [admin, trainee, reader]) if (extra) people.set(extra.username, extra);
  if (reader) await ensureReaderActivity(reader, people);

  const spotlight = await ensurePendingSpotlight(ctx);
  const flags = await ensureFlags(people);
  return { admin, trainee, reader, passes, traineeStories, flags, spotlight };
}
