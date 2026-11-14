import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, type Executor } from "../db/client.js";
import { article, socialConnection, socialPost } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { isInstagramLoginToken, MetaError, postFacebookPhoto, postInstagramFeed, postInstagramStory, refreshInstagramToken } from "../lib/meta.js";
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

export async function saveInstagramConnection(
  userId: string,
  account: { id: string; username: string; token: string; expiresAt: Date | null },
  postFormat?: "story" | "feed",
): Promise<void> {
  const values = {
    ...(postFormat ? { postFormat } : {}),
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

const FEED_SIZE = { width: 1080, height: 1350 } as const;
const feedImageKey = (userId: string, articleId: string) => `covers/${userId}/social-feed-${articleId}.jpg`;

const FONT_DIR = join(process.cwd(), "data", "fonts");
// Only the bundled fonts (servers have none, and this Mac's fontconfig has no config): read before the first text render.
process.env.FONTCONFIG_FILE ??= join(FONT_DIR, "fonts.conf");
/** The headline's font by script: Kannada and Hindi in Noto Sans Bold, English in Archivo Black — the poster's font. */
function fontFor(text: string): { file: string; family: string; weight: string; indic: boolean } {
  if (/[\u0c80-\u0cff]/.test(text)) return { file: "NotoSansKannada.ttf", family: "Noto Sans Kannada", weight: ' weight="bold"', indic: true };
  if (/[\u0900-\u097f]/.test(text)) return { file: "NotoSansDevanagari.ttf", family: "Noto Sans Devanagari", weight: ' weight="bold"', indic: true };
  return { file: "ArchivoBlack.ttf", family: "Archivo Black", weight: "", indic: false };
}
const escapeMarkup = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The white headline drawn with Pango (Indic scripts shaped properly). */
function headlineLayer(text: string, size: number, width: number): Promise<Buffer> {
  const font = fontFor(text);
  return sharp({
    text: {
      text: `<span foreground="white"${font.weight}>${escapeMarkup(text)}</span>`,
      font: `${font.family} ${size}`,
      fontfile: join(FONT_DIR, font.file),
      width,
      dpi: 72,
      rgba: true,
      wrap: "word",
      spacing: Math.round(size * (font.indic ? 0.08 : -0.06)),
    },
  })
    .png()
    .toBuffer();
}

/** The headline at the largest size step that fits `maxHeight` (shorter headlines start bigger). */
async function fittedHeadline(text: string, sizes: number[], width: number, maxHeight: number): Promise<{ image: Buffer; height: number }> {
  const start = text.length <= 45 ? 0 : text.length <= 80 ? 1 : text.length <= 115 ? 2 : 3;
  let image = await headlineLayer(text, sizes[start]!, width);
  let height = (await sharp(image).metadata()).height ?? 0;
  for (let i = start + 1; i < sizes.length && height > maxHeight; i++) {
    image = await headlineLayer(text, sizes[i]!, width);
    height = (await sharp(image).metadata()).height ?? 0;
  }
  return { image, height };
}

const INK = "#16181d";
const BRAND = "#e30613";

/**
 * "Classic" (the default poster, owner 2026-11-14 "same template only"): the photo on top melting into a red-to-ink
 * panel that carries the big white headline; the panel is as tall as its text, the photo takes the rest.
 */
async function classicFeedImage(input: Buffer, title: string): Promise<Buffer> {
  const { width, height } = FEED_SIZE;
  const padX = 64;
  const padTop = 34;
  const padBottom = 70;
  const sizes = [104, 92, 80, 70, 62, 54];
  const headline = await fittedHeadline(title, sizes, width - padX * 2, height * 0.42);
  const panelHeight = padTop + headline.height + padBottom;
  const photoHeight = height - panelHeight;
  const melt = 216;
  const photo = await sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: INK })
    .resize(width, photoHeight, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();
  const art = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs>` +
      `<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND}" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="${BRAND}"/></linearGradient>` +
      `<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0.05" stop-color="${BRAND}"/>` +
      `<stop offset="1" stop-color="${INK}"/></linearGradient>` +
      `<radialGradient id="s" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${photoHeight}) scale(${width * 1.1} ${panelHeight * 0.7})">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.65" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      `</defs>` +
      `<rect y="${photoHeight - melt}" width="${width}" height="${melt}" fill="url(#m)"/>` +
      `<rect y="${photoHeight}" width="${width}" height="${panelHeight}" fill="url(#p)"/>` +
      `<rect y="${photoHeight}" width="${width}" height="${panelHeight}" fill="url(#s)"/></svg>`,
  );
  return sharp({ create: { width, height, channels: 3, background: INK } })
    .composite([
      { input: photo, left: 0, top: 0 },
      { input: art, left: 0, top: 0 },
      { input: headline.image, left: padX, top: photoHeight + padTop },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/** "Full bleed": the cover fills the picture and a dark fade rises from the bottom under the big white headline. */
async function fullBleedFeedImage(input: Buffer, title: string): Promise<Buffer> {
  const { width, height } = FEED_SIZE;
  const pad = 64;
  const sizes = fontFor(title).indic ? [88, 78, 70, 64, 56, 50] : [92, 78, 68, 60, 52, 46];
  const headline = await fittedHeadline(title, sizes, width - pad * 2, height * 0.45);
  const headlineTop = height - pad - 8 - headline.height;
  const fadeTop = Math.max(0, Math.min(height * 0.35, headlineTop - 320));
  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${INK}" stop-opacity="0"/><stop offset="0.45" stop-color="${INK}" stop-opacity="0.5"/>` +
      `<stop offset="1" stop-color="${INK}" stop-opacity="0.9"/></linearGradient></defs>` +
      `<rect y="${fadeTop}" width="${width}" height="${height - fadeTop}" fill="url(#f)"/></svg>`,
  );
  const photo = await sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: INK })
    .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();
  return sharp(photo)
    .composite([
      { input: shade, left: 0, top: 0 },
      { input: headline.image, left: pad, top: headlineTop },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/**
 * Instagram feed image (owner 2026-11-14, replaces the 2026-11-12 logo watermark): the story's own poster template on
 * the feed's 4:5 frame (the feed can't take 9:16). No WebNewsX logo and no profile line. "full-bleed" has its own
 * layout; every other template uses "classic", the default (nearly every webnews.in story).
 */
async function storeFeedImage(userId: string, articleId: string, input: Buffer, title: string, template: string | null): Promise<string> {
  const text = title.trim();
  const jpeg = template === "full-bleed" ? await fullBleedFeedImage(input, text) : await classicFeedImage(input, text);
  const key = feedImageKey(userId, articleId);
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
  return [story.title ?? "", story.excerpt ?? "", `Read the full story on WebNewsX: ${link}`].filter(Boolean).join("\n\n");
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
  const feed = post.provider === "instagram" && connection.postFormat === "feed";
  let imageKey = post.imageKey;
  if (feed) {
    // The cover (else the poster) on a 4:5 frame with the headline.
    try {
      const source = story.coverKey ?? post.imageKey;
      imageKey = source
        ? await storeFeedImage(post.userId, post.articleId, await readStored(source), story.title ?? "", story.template)
        : null;
    } catch (error) {
      return void (await fail(`The feed image couldn't be made: ${error instanceof Error ? error.message : "unknown"}`, true));
    }
  }
  const imageUrl = imageKey ? publicImageUrl(imageKey) : null;
  if (!imageUrl) {
    return void (await fail("Auto-posting starts once WebNewsX is online at its https address (Meta can't fetch images from this computer)", false));
  }
  try {
    const token = decryptToken(connection.tokenEnc);
    const remoteId =
      post.provider === "instagram"
        ? feed
          ? await postInstagramFeed(connection.accountId, token, imageUrl, captionFor(story))
          : await postInstagramStory(connection.accountId, token, imageUrl)
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
    // Hand-added Facebook (Page) tokens don't expire and can't be refreshed this way.
    if (!isInstagramLoginToken(decryptToken(row.tokenEnc))) continue;
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
