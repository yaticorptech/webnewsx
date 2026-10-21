import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, type Executor } from "../db/client.js";
import { article, socialConnection, socialPost } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { MetaError, postFacebookPhoto, postInstagramStory, refreshInstagramToken } from "../lib/meta.js";
import { decryptToken, encryptToken } from "../lib/social-crypto.js";
import { storage } from "../lib/storage.js";
import type { SocialConnection, SocialProvider, SocialStatus, UpdateSocialInput } from "../shared/contracts.js";
import type { Viewer } from "../types.js";
import { isUuid } from "./shared.js";

/*
 * Auto-posting (owner 2026-09-30): a verified reporter's connected Instagram / Facebook Page get every story they
 * publish — the 9:16 poster as an Instagram Story, a photo post on the Page. Publishing queues one `social_post` per
 * connected account; the composer uploads the poster as a JPEG right after (else, after WAIT_FOR_POSTER, the story's
 * cover is used); a background loop sends them, retrying a few times.
 */

const WAIT_FOR_POSTER_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;
const POSTER_SIZE = { width: 1080, height: 1920 } as const;

export const isVerifiedReporter = (viewer: Pick<Viewer, "reporterLevel" | "onboarded">) => viewer.onboarded && viewer.reporterLevel === "verified";

/* ─────────────── Connections ─────────────── */

export async function getSocialStatus(viewer: Viewer): Promise<SocialStatus> {
  const rows = await db.select().from(socialConnection).where(eq(socialConnection.userId, viewer.id));
  const latest = await db
    .selectDistinctOn([socialPost.provider], {
      provider: socialPost.provider,
      status: socialPost.status,
      error: socialPost.error,
      createdAt: socialPost.createdAt,
      postedAt: socialPost.postedAt,
      title: article.title,
    })
    .from(socialPost)
    .innerJoin(article, eq(article.id, socialPost.articleId))
    .where(eq(socialPost.userId, viewer.id))
    .orderBy(socialPost.provider, desc(socialPost.createdAt));
  const lastOf = new Map(latest.map((row) => [row.provider, row]));
  const connections: SocialConnection[] = rows.map((row) => {
    const last = lastOf.get(row.provider);
    return {
      provider: row.provider,
      accountName: row.accountName,
      accountId: row.accountId,
      autoPost: row.autoPost,
      connectedAt: row.connectedAt.toISOString(),
      pages: row.pages.map((p) => ({ id: p.id, name: p.name })),
      needsReconnect: row.needsReconnectAt !== null,
      lastPost: last
        ? { status: last.status, storyTitle: last.title ?? "Untitled story", error: last.error, at: (last.postedAt ?? last.createdAt).toISOString() }
        : null,
    };
  });
  return {
    configured: { facebook: env.facebookEnabled, instagram: env.instagramEnabled },
    eligible: isVerifiedReporter(viewer),
    connections,
  };
}

export async function saveFacebookConnection(userId: string, pages: Array<{ id: string; name: string; token: string }>): Promise<void> {
  const [first] = pages;
  if (!first) throw new ApiError(400, "no_facebook_page", "Your Facebook account doesn't manage a Page. Create a Page (or get added to one), then connect again.");
  const stored = pages.map((p) => ({ id: p.id, name: p.name, tokenEnc: encryptToken(p.token) }));
  // Reconnecting keeps the Page chosen before, when it's still there.
  const [existing] = await db
    .select({ accountId: socialConnection.accountId })
    .from(socialConnection)
    .where(and(eq(socialConnection.userId, userId), eq(socialConnection.provider, "facebook")));
  const chosen = stored.find((p) => p.id === existing?.accountId) ?? stored[0] ?? { ...first, tokenEnc: encryptToken(first.token) };
  const values = {
    accountId: chosen.id,
    accountName: chosen.name,
    tokenEnc: chosen.tokenEnc,
    tokenExpiresAt: null,
    pages: stored,
    needsReconnectAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(socialConnection)
    .values({ userId, provider: "facebook", ...values })
    .onConflictDoUpdate({ target: [socialConnection.userId, socialConnection.provider], set: values });
}

export async function saveInstagramConnection(userId: string, account: { id: string; username: string; token: string; expiresAt: Date }): Promise<void> {
  const values = {
    accountId: account.id,
    accountName: account.username,
    tokenEnc: encryptToken(account.token),
    tokenExpiresAt: account.expiresAt,
    pages: [],
    needsReconnectAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(socialConnection)
    .values({ userId, provider: "instagram", ...values })
    .onConflictDoUpdate({ target: [socialConnection.userId, socialConnection.provider], set: values });
}

export async function updateSocialConnection(userId: string, provider: SocialProvider, input: UpdateSocialInput): Promise<void> {
  const [row] = await db
    .select()
    .from(socialConnection)
    .where(and(eq(socialConnection.userId, userId), eq(socialConnection.provider, provider)));
  if (!row) throw notFound("That account isn't connected");
  const changes: Partial<typeof socialConnection.$inferInsert> = { updatedAt: new Date() };
  if (input.autoPost !== undefined) changes.autoPost = input.autoPost;
  if (input.pageId !== undefined) {
    const page = row.pages.find((p) => p.id === input.pageId);
    if (provider !== "facebook" || !page) throw new ApiError(400, "unknown_page", "Pick one of your Pages");
    changes.accountId = page.id;
    changes.accountName = page.name;
    changes.tokenEnc = page.tokenEnc;
  }
  await db
    .update(socialConnection)
    .set(changes)
    .where(and(eq(socialConnection.userId, userId), eq(socialConnection.provider, provider)));
}

export async function disconnectSocial(userId: string, provider: SocialProvider): Promise<void> {
  await db.delete(socialConnection).where(and(eq(socialConnection.userId, userId), eq(socialConnection.provider, provider)));
  // Nothing queued for it is sent any more.
  await db
    .update(socialPost)
    .set({ status: "failed", error: "Account disconnected" })
    .where(and(eq(socialPost.userId, userId), eq(socialPost.provider, provider), inArray(socialPost.status, ["waiting", "pending"])));
}

/* ─────────────── Queue ─────────────── */

/** A story just went live: one post per connected account with auto-post on (only for verified reporters). */
export async function enqueueSocialPosts(executor: Executor, articleId: string, authorId: string): Promise<void> {
  await executor.execute(sql`
    insert into social_post (article_id, user_id, provider, status)
    select ${articleId}::uuid, c.user_id, c.provider, 'waiting'
    from social_connection c
    join "user" u on u.id = c.user_id
    where c.user_id = ${authorId} and c.auto_post and c.needs_reconnect_at is null and u.reporter_level = 'verified'
    on conflict (article_id, provider) do nothing
  `);
}

const socialImageKey = (userId: string, articleId: string) => `covers/${userId}/social-${articleId}.jpg`;

async function storeSocialImage(userId: string, articleId: string, input: Buffer): Promise<string> {
  const jpeg = await sharp(input, { failOn: "error" })
    .rotate()
    .resize(POSTER_SIZE.width, POSTER_SIZE.height, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const key = socialImageKey(userId, articleId);
  await storage.put(key, jpeg, "image/jpeg");
  return key;
}

/** Does this story have auto-posts waiting for its poster? (The composer skips the upload otherwise.) */
export async function wantsSocialImage(articleId: string, userId: string): Promise<boolean> {
  if (!isUuid(articleId)) return false;
  const [row] = await db
    .select({ id: socialPost.id })
    .from(socialPost)
    .where(and(eq(socialPost.articleId, articleId), eq(socialPost.userId, userId), eq(socialPost.status, "waiting")))
    .limit(1);
  return Boolean(row);
}

/** The composer's poster (the author's own story): the waiting posts get it and go out. */
export async function attachSocialImage(articleId: string, userId: string, image: Buffer): Promise<{ queued: number }> {
  if (!isUuid(articleId)) throw notFound("Story not found");
  const [story] = await db.select({ authorId: article.authorId }).from(article).where(eq(article.id, articleId)).limit(1);
  if (!story) throw notFound("Story not found");
  if (story.authorId !== userId) throw forbidden("Only the story's author can do that");
  if (!(await wantsSocialImage(articleId, userId))) return { queued: 0 };
  let key: string;
  try {
    key = await storeSocialImage(userId, articleId, image);
  } catch {
    throw new ApiError(415, "unsupported_image", "That poster image couldn't be read");
  }
  const rows = await db
    .update(socialPost)
    .set({ imageKey: key, status: "pending", nextAttemptAt: new Date() })
    .where(and(eq(socialPost.articleId, articleId), eq(socialPost.userId, userId), eq(socialPost.status, "waiting")))
    .returning({ id: socialPost.id });
  wakeSocialPoster();
  return { queued: rows.length };
}

/* ─────────────── Worker ─────────────── */

async function readStored(key: string): Promise<Buffer> {
  if (storage.kind === "local") return readFile(join(env.LOCAL_UPLOAD_DIR, key));
  const res = await fetch(storage.urlFor(key), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`cover fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Posts still waiting for the composer's poster after a while: the story's cover (9:16) is sent instead. */
async function useCoverForStalePosts(): Promise<void> {
  const stale = await db
    .select({ articleId: socialPost.articleId, userId: socialPost.userId, coverKey: article.coverKey })
    .from(socialPost)
    .innerJoin(article, eq(article.id, socialPost.articleId))
    .where(and(eq(socialPost.status, "waiting"), lte(socialPost.createdAt, new Date(Date.now() - WAIT_FOR_POSTER_MS))))
    .limit(20);
  const done = new Set<string>();
  for (const row of stale) {
    if (done.has(row.articleId)) continue;
    done.add(row.articleId);
    let key: string | null = null;
    try {
      if (row.coverKey) key = await storeSocialImage(row.userId, row.articleId, await readStored(row.coverKey));
    } catch (error) {
      console.warn("[social] cover fallback failed:", error instanceof Error ? error.message : error);
    }
    await db
      .update(socialPost)
      .set(key ? { imageKey: key, status: "pending", nextAttemptAt: new Date() } : { status: "failed", error: "The story has no image to post" })
      .where(and(eq(socialPost.articleId, row.articleId), eq(socialPost.status, "waiting")));
  }
}

/** Meta downloads the image itself: it needs the site's public address. */
function publicImageUrl(key: string): string | null {
  const url = storage.urlFor(key);
  const absolute = /^https?:\/\//.test(url) ? url : `${env.FRONTEND_URL}${url}`;
  return /^https:\/\/(?!localhost|127\.|192\.168\.|10\.)/.test(absolute) ? absolute : null;
}

function captionFor(story: { title: string | null; excerpt: string | null; slug: string | null; shortCode: string | null }): string {
  const link = story.shortCode ? `${env.FRONTEND_URL}/s/${story.shortCode}` : `${env.FRONTEND_URL}/a/${story.slug ?? ""}`;
  return [story.title ?? "", story.excerpt ?? "", `Read the full story on WebNEWS: ${link}`].filter(Boolean).join("\n\n");
}

async function sendOne(postId: string): Promise<void> {
  const [row] = await db
    .select({ post: socialPost, connection: socialConnection, story: article })
    .from(socialPost)
    .innerJoin(article, eq(article.id, socialPost.articleId))
    .leftJoin(socialConnection, and(eq(socialConnection.userId, socialPost.userId), eq(socialConnection.provider, socialPost.provider)))
    .where(eq(socialPost.id, postId))
    .limit(1);
  if (!row) return;
  const { post, connection, story } = row;
  const fail = (error: string, retry: boolean) =>
    db
      .update(socialPost)
      .set(
        retry && post.attempts + 1 < MAX_ATTEMPTS
          ? { status: "pending", error, attempts: post.attempts + 1, nextAttemptAt: new Date(Date.now() + 2 ** post.attempts * 60_000) }
          : { status: "failed", error, attempts: post.attempts + 1 },
      )
      .where(eq(socialPost.id, post.id));

  if (!connection) return void (await fail("Account disconnected", false));
  if (story.status !== "published" || story.hiddenAt) return void (await fail("The story isn't public any more", false));
  const imageUrl = post.imageKey ? publicImageUrl(post.imageKey) : null;
  if (!imageUrl) {
    return void (await fail("Auto-posting starts once WebNEWS is online at its https address (Meta can't fetch images from this computer)", false));
  }
  try {
    const token = decryptToken(connection.tokenEnc);
    const remoteId =
      post.provider === "instagram"
        ? await postInstagramStory(connection.accountId, token, imageUrl)
        : await postFacebookPhoto(connection.accountId, token, imageUrl, captionFor(story));
    await db.update(socialPost).set({ status: "posted", remoteId, error: null, postedAt: new Date(), attempts: post.attempts + 1 }).where(eq(socialPost.id, post.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting failed";
    if (error instanceof MetaError && error.auth) {
      await db
        .update(socialConnection)
        .set({ needsReconnectAt: new Date() })
        .where(and(eq(socialConnection.userId, post.userId), eq(socialConnection.provider, post.provider)));
      return void (await fail(`${message} — connect the account again`, false));
    }
    await fail(message, true);
  }
}

/** Claims due posts (so two backend instances never send one twice) and sends them. */
async function sendDuePosts(): Promise<void> {
  const claimed = await db.execute<{ id: string }>(sql`
    update social_post set next_attempt_at = now() + interval '10 minutes'
    where id in (
      select id from social_post where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at limit 5 for update skip locked
    )
    returning id
  `);
  for (const { id } of claimed) await sendOne(id);
}

/** Instagram tokens last 60 days: refreshed when fewer than 10 are left. */
async function refreshInstagramTokens(): Promise<void> {
  const due = await db
    .select()
    .from(socialConnection)
    .where(
      and(
        eq(socialConnection.provider, "instagram"),
        sql`${socialConnection.needsReconnectAt} is null`,
        sql`${socialConnection.tokenExpiresAt} < now() + interval '10 days'`,
        sql`${socialConnection.updatedAt} < now() - interval '1 day'`,
      ),
    )
    .limit(20);
  for (const row of due) {
    try {
      const fresh = await refreshInstagramToken(decryptToken(row.tokenEnc));
      await db
        .update(socialConnection)
        .set({ tokenEnc: encryptToken(fresh.token), tokenExpiresAt: fresh.expiresAt, updatedAt: new Date() })
        .where(and(eq(socialConnection.userId, row.userId), eq(socialConnection.provider, "instagram")));
    } catch {
      await db
        .update(socialConnection)
        .set({ needsReconnectAt: new Date() })
        .where(and(eq(socialConnection.userId, row.userId), eq(socialConnection.provider, "instagram")));
    }
  }
}

let wake: (() => void) | null = null;
/** Runs the loop now (a poster just arrived). */
export function wakeSocialPoster(): void {
  wake?.();
}

const TICK_MS = 15_000;
const REFRESH_EVERY_MS = 60 * 60_000;

/** The background loop (src/index.ts). Returns the stop function. */
export function startSocialPoster(): () => void {
  let stopped = false;
  let running = false;
  let lastRefresh = 0;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await useCoverForStalePosts();
      await sendDuePosts();
      if (Date.now() - lastRefresh > REFRESH_EVERY_MS) {
        lastRefresh = Date.now();
        await refreshInstagramTokens();
      }
    } catch (error) {
      console.warn("[social] auto-post loop failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  wake = () => void tick();
  return () => {
    stopped = true;
    wake = null;
    clearInterval(timer);
  };
}
