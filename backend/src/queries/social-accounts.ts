import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import sharp, { type OverlayOptions } from "sharp";
import { db, type Executor } from "../db/client.js";
import { article, socialConnection, socialPost } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import {
  deleteMetaPost,
  isInstagramLoginToken,
  MetaError,
  postFacebookPhoto,
  postInstagramFeed,
  postInstagramStory,
  postPermalink,
  refreshInstagramToken,
} from "../lib/meta.js";
import { decryptToken, encryptToken } from "../lib/social-crypto.js";
import { candidateModels, GEMINI, keyId, storedKey, workingModel } from "../routes/ai.js";
import { storage } from "../lib/storage.js";
import { CATEGORY_LABELS, CATEGORY_LABELS_KN, SOCIAL_PROVIDER_VALUES, type Category, type SocialConnection, type SocialPostItem, type SocialProvider, type SocialStatus, type UpdateSocialInput } from "../shared/contracts.js";
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
/** Posts listed per account in Connected accounts. */
const RECENT_POSTS = 8;
const POSTER_SIZE = { width: 1080, height: 1920 } as const;

export const isVerifiedReporter = (viewer: Pick<Viewer, "reporterLevel" | "onboarded">) => viewer.onboarded && viewer.reporterLevel === "verified";

/* ─────────────── Connections ─────────────── */

export async function getSocialStatus(viewer: Viewer): Promise<SocialStatus> {
  const rows = await db.select().from(socialConnection).where(eq(socialConnection.userId, viewer.id));
  const recent = await db
    .select({
      id: socialPost.id,
      provider: socialPost.provider,
      articleId: socialPost.articleId,
      status: socialPost.status,
      error: socialPost.error,
      createdAt: socialPost.createdAt,
      postedAt: socialPost.postedAt,
      permalink: socialPost.permalink,
      removedAt: socialPost.removedAt,
      removeError: socialPost.removeError,
      storyTitle: socialPost.storyTitle,
      title: article.title,
    })
    .from(socialPost)
    .leftJoin(article, eq(article.id, socialPost.articleId))
    .where(eq(socialPost.userId, viewer.id))
    .orderBy(desc(socialPost.createdAt))
    .limit(40);
  const postsOf = (provider: SocialProvider): SocialPostItem[] =>
    recent
      .filter((row) => row.provider === provider)
      .slice(0, RECENT_POSTS)
      .map((row) => ({
        id: row.id,
        articleId: row.articleId,
        status: row.status,
        storyTitle: row.title ?? row.storyTitle ?? "Untitled story",
        error: row.error,
        at: (row.postedAt ?? row.createdAt).toISOString(),
        permalink: row.permalink,
        storyDeleted: row.articleId === null,
        removed: row.removedAt !== null,
        removeError: row.removeError,
      }));
  const lastOf = new Map(SOCIAL_PROVIDER_VALUES.map((provider) => [provider, postsOf(provider)[0]]));
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
      lastPost: last ? { status: last.status, storyTitle: last.storyTitle, error: last.error, at: last.at } : null,
      recentPosts: postsOf(row.provider),
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

const INK = "#16181d";
const BRAND = "#e30613";

const STOP_WORDS = new Set(
  (
    "a an the and or but of in on at to for with as by from into onto over under after before amid against about is are was were be been " +
    "has have had its it this that these those will would can not no new says said say than then up out off now how why what who " +
    "ಮತ್ತು ಹಾಗೂ ಈ ಆ ಒಂದು ಮೇಲೂ ಮೇಲೆ ಬಗ್ಗೆ ಎಂದು ಇನ್ನು ಅಥವಾ ಸಹ ಕೂಡ ಮೂಲಕ ಜೊತೆ ನಂತರ ಮುನ್ನ ವೇಳೆ ಇದೆ ಇಲ್ಲ ಇದು ಅದು ಎಂಬ ಕುರಿತು ವಿರುದ್ಧ ಬಳಿ ಹೊಸ " +
    "और का की के में से पर को है हैं था ने भी यह वह एक तक लिए बाद"
  ).split(" "),
);
const bare = (word: string) => word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "").toLowerCase();

/** Word indexes of the headline's main point when there's no AI: the subject before a colon (else the first words), plus numbers. */
function ruleHighlights(words: string[]): Set<number> {
  const picked = new Set<number>();
  const colon = words.findIndex((word) => /[:：]$/.test(word));
  if (colon >= 0 && colon <= 3) {
    for (let i = 0; i <= colon; i++) picked.add(i);
  } else {
    for (let i = 0; i < words.length && picked.size < 2 && !STOP_WORDS.has(bare(words[i]!)); i++) picked.add(i);
  }
  words.forEach((word, i) => {
    if (picked.size < 4 && /\d/.test(word) && !picked.has(i)) picked.add(i);
  });
  return picked;
}

/** The headline's key phrases from the account's own Gemini key (the composer's "Generate with AI" key), as word indexes. */
export async function aiHighlights(userId: string, words: string[]): Promise<Set<number> | null> {
  const key = await storedKey(userId);
  if (!key) return null;
  const headline = words.join(" ");
  const system = [
    "You pick the words to highlight in a news headline on a social media news card.",
    "Return 1 or 2 short phrases (1-3 words each) copied EXACTLY from the headline that carry its main point: the key person, place, thing, number or action.",
    "Never pick filler words (and, of, the, ಮತ್ತು, ಹಾಗೂ, और…). Answer with a JSON array of strings only.",
  ].join(" ");
  for (const model of await candidateModels(key)) {
    const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: headline }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) continue;
    workingModel.set(keyId(key), { model, at: Date.now() });
    const data = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null;
    const text = (data?.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("");
    let phrases: unknown;
    try {
      phrases = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    } catch {
      return null;
    }
    if (!Array.isArray(phrases)) return null;
    const picked = new Set<number>();
    const bareWords = words.map(bare);
    for (const phrase of phrases.slice(0, 2)) {
      if (typeof phrase !== "string") continue;
      const parts = phrase.split(/\s+/).map(bare).filter(Boolean);
      if (!parts.length || parts.length > 4) continue;
      const at = bareWords.findIndex((_, i) => parts.every((part, j) => bareWords[i + j] === part));
      if (at >= 0) parts.forEach((_, j) => picked.add(at + j));
    }
    return picked.size ? picked : null;
  }
  return null;
}

/** One line of white text drawn with Pango (Indic scripts shaped properly); `markup` is already escaped. */
async function textLayer(markup: string, font: ReturnType<typeof fontFor>, size: number, width?: number): Promise<{ image: Buffer; width: number; height: number }> {
  const image = await sharp({
    text: {
      text: `<span foreground="white"${font.weight}>${markup}</span>`,
      font: `${font.family} ${size}`,
      fontfile: join(FONT_DIR, font.file),
      ...(width ? { width, wrap: "word" as const } : {}),
      dpi: 72,
      rgba: true,
      spacing: Math.round(size * (font.indic ? 0.08 : 0.3)),
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(image).metadata();
  return { image, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/**
 * The headline as lines, wrapped here (not by Pango) so the red word boxes can follow the lines like the owner's
 * reference: the first words of the 1st line, then the first word of every other line after it.
 */
async function boxedHeadline(title: string, maxWidth: number, maxHeight: number, highlights: (words: string[]) => Set<number>) {
  const font = fontFor(title);
  const words = title.split(/\s+/).filter(Boolean);
  const boxed = highlights(words);
  const sizes = font.indic ? [58, 52, 47, 43, 39] : [70, 62, 55, 49, 44];
  for (const [step, size] of sizes.entries()) {
    const widths = await Promise.all(words.map(async (word) => (await textLayer(escapeMarkup(word), font, size)).width));
    const space = Math.round(size * 0.3);
    const boxPad = space * 2; // the spaces inside a red box
    // Lines of word indexes; a red box adds a space of padding on each side.
    const lines: number[][] = [];
    let line: number[] = [];
    let lineWidth = 0;
    words.forEach((_, i) => {
      const opensBox = boxed.has(i) && !(line.length && boxed.has(i - 1));
      const add = (line.length ? space : 0) + widths[i]! + (opensBox ? boxPad : 0);
      if (line.length && lineWidth + add > maxWidth) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      lineWidth += (line.length ? space : 0) + widths[i]! + (boxed.has(i) && !(line.length && boxed.has(i - 1)) ? boxPad : 0);
      line.push(i);
    });
    if (line.length) lines.push(line);
    const images = await Promise.all(
      lines.map(async (indexes) => {
        // The red boxes are drawn by us (Pango's own background is too short for Kannada's tall letters): measure
        // where each box starts and ends in the same text.
        let text = "";
        const marks: { from: string; to: string }[] = [];
        indexes.forEach((i, j) => {
          const inBox = boxed.has(i);
          const prevInBox = j > 0 && boxed.has(indexes[j - 1]!);
          const nextInBox = j < indexes.length - 1 && boxed.has(indexes[j + 1]!);
          if (j > 0) text += " ";
          if (inBox && !prevInBox) marks.push({ from: text, to: "" });
          text += inBox && !prevInBox ? `\u00a0${escapeMarkup(words[i]!)}` : escapeMarkup(words[i]!);
          if (inBox && !nextInBox) {
            text += "\u00a0";
            marks[marks.length - 1]!.to = text;
          }
        });
        // Width up to a point, trailing spaces included (Pango drops them, so measure against a closing "|").
        const bar = (await textLayer("|", font, size)).width;
        const measure = async (part: string) => (part ? (await textLayer(`${part}|`, font, size)).width - bar : 0);
        const layer = await textLayer(text, font, size);
        const boxes = await Promise.all(marks.map(async (mark) => ({ x0: await measure(mark.from), x1: await measure(mark.to) })));
        return { ...layer, boxes };
      }),
    );
    const gap = Math.round(size * 0.18);
    const height = images.reduce((sum, image) => sum + image.height, 0) + gap * (images.length - 1);
    if (height <= maxHeight || step === sizes.length - 1) return { images, gap, height };
  }
  throw new Error("unreachable");
}

/** The summary under the headline, cut to `maxLines` lines with an ellipsis. */
async function summaryLayer(text: string, width: number, maxLines: number) {
  const font = fontFor(text);
  const size = 29;
  let words = text.split(/\s+/).filter(Boolean);
  const sample = escapeMarkup(words.slice(0, 3).join(" "));
  const one = (await textLayer(sample, font, size, width)).height;
  const two = (await textLayer(`${sample}\n${sample}`, font, size, width)).height;
  const maxHeight = two + (two - one) * (maxLines - 1.5); // half a line of slack for tall letters
  let layer = await textLayer(escapeMarkup(words.join(" ")), font, size, width);
  while (layer.height > maxHeight && words.length > 4) {
    words = words.slice(0, -2);
    layer = await textLayer(`${escapeMarkup(words.join(" ").replace(/[,.:;–-]+$/, ""))}…`, font, size, width);
  }
  return layer;
}

/**
 * The one Instagram feed template for every post (owner 2026-11-14, their reference image): the cover fills the 4:5
 * frame, a dark fade rises from the bottom, then the red category tag, the big white headline with red word boxes,
 * and the story's summary. No logo, no profile line.
 */
export async function newsFeedImage(
  input: Buffer,
  story: { title: string; summary: string; category: string | null; highlights?: Set<number> | null },
): Promise<Buffer> {
  const { width, height } = FEED_SIZE;
  const padX = 60;
  const padBottom = 62;
  const inner = width - padX * 2;
  const summary = story.summary ? await summaryLayer(story.summary, inner, 3) : null;
  const headline = await boxedHeadline(story.title, inner, height * 0.36, (words) => story.highlights ?? ruleHighlights(words));
  const tag = story.category ? await textLayer(escapeMarkup(story.category), fontFor(story.category), 30) : null;
  const tagPad = { x: 18, y: 8 };

  let y = height - padBottom;
  const layers: OverlayOptions[] = [];
  if (summary) {
    y -= summary.height;
    layers.push({ input: summary.image, left: padX, top: y });
    y -= 40;
  }
  y -= headline.height;
  const headlineTop = y;
  let lineTop = y;
  let boxRects = "";
  for (const line of headline.images) {
    for (const box of line.boxes) {
      boxRects += `<rect x="${padX - 4 + box.x0}" y="${lineTop - 2}" width="${box.x1 - box.x0}" height="${line.height + 4}" fill="${BRAND}"/>`;
    }
    layers.push({ input: line.image, left: padX - 4, top: lineTop });
    lineTop += line.height + headline.gap;
  }
  let tagRect = "";
  if (tag) {
    const tagHeight = tag.height + tagPad.y * 2;
    y -= 30 + tagHeight;
    tagRect = `<rect x="${padX}" y="${y}" width="${tag.width + tagPad.x * 2}" height="${tagHeight}" rx="6" fill="${BRAND}"/>`;
    layers.push({ input: tag.image, left: padX + tagPad.x, top: y + tagPad.y });
  }
  const fadeTop = Math.max(0, Math.min(height * 0.42, y - 260));
  const art = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="${((headlineTop - fadeTop) / (height - fadeTop)).toFixed(3)}" stop-color="#000" stop-opacity="0.62"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0.9"/></linearGradient></defs>` +
      `<rect y="${fadeTop}" width="${width}" height="${height - fadeTop}" fill="url(#f)"/>${tagRect}${boxRects}</svg>`,
  );
  const photo = await sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: INK })
    .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();
  return sharp(photo)
    .composite([{ input: art, left: 0, top: 0 }, ...layers])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function storeFeedImage(
  userId: string,
  articleId: string,
  input: Buffer,
  story: { title: string | null; blurb: string | null; excerpt: string | null; category: Category | null; language: string | null },
): Promise<string> {
  const title = (story.title ?? "").trim();
  const kannada = story.language === "kn" || /[\u0c80-\u0cff]/.test(title);
  const category = story.category ? (kannada ? CATEGORY_LABELS_KN : CATEGORY_LABELS)[story.category] : null;
  const summary = (story.blurb || story.excerpt || "").replace(/\s+/g, " ").trim();
  const highlights = await aiHighlights(userId, title.split(/\s+/).filter(Boolean)).catch(() => null);
  const jpeg = await newsFeedImage(input, { title, summary, category, highlights });
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

/* ─────────────── Removal and repost (owner 2026-11-14) ─────────────── */

/**
 * A story is being deleted (inside its transaction, before the row goes): posts not sent yet are dropped; sent ones
 * keep the title and outlive the story (article_id → null) until the worker deletes them on Instagram / Facebook.
 */
export async function detachSocialPosts(tx: Executor, articleId: string, title: string | null): Promise<void> {
  await tx.delete(socialPost).where(and(eq(socialPost.articleId, articleId), sql`${socialPost.status} <> 'posted'`));
  await tx.update(socialPost).set({ storyTitle: title }).where(and(eq(socialPost.articleId, articleId), eq(socialPost.status, "posted")));
  wakeSocialPoster();
}

/** Deletes one sent post on Meta. Returns null when done, else why Meta refused. */
async function removeRemote(post: typeof socialPost.$inferSelect): Promise<string | null> {
  if (!post.remoteId) return null;
  const [connection] = await db
    .select()
    .from(socialConnection)
    .where(and(eq(socialConnection.userId, post.userId), eq(socialConnection.provider, post.provider)))
    .limit(1);
  if (!connection) return "The account is no longer connected — delete the post in the app.";
  try {
    // Facebook posts live on the Page they went to: its own token (the connection's token is the user's).
    const page = post.provider === "facebook" ? connection.pages.find((p) => post.remoteId?.startsWith(`${p.id}_`)) : undefined;
    await deleteMetaPost(post.provider, decryptToken(page?.tokenEnc ?? connection.tokenEnc), post.remoteId);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Meta refused the delete";
  }
}

/** Sent posts of deleted stories: deleted on Meta too (or marked with why it couldn't be done). */
async function removeDeletedStoryPosts(): Promise<void> {
  const due = await db
    .select()
    .from(socialPost)
    .where(and(sql`${socialPost.articleId} is null`, eq(socialPost.status, "posted"), sql`${socialPost.removedAt} is null`, sql`${socialPost.removeError} is null`))
    .limit(10);
  for (const post of due) {
    const refused = await removeRemote(post);
    await db
      .update(socialPost)
      .set(refused ? { removeError: refused } : { removedAt: new Date() })
      .where(eq(socialPost.id, post.id));
  }
}

/**
 * Repost (owner 2026-11-14): a failed post is sent again; a sent one is deleted on Instagram / Facebook first and then
 * sent again (with the story's current title and image). Only the story's author, while it is public.
 */
export async function repostSocial(viewer: Viewer, postId: string): Promise<SocialStatus> {
  if (!isUuid(postId)) throw notFound("Post not found");
  const [row] = await db
    .select({ post: socialPost, story: article })
    .from(socialPost)
    .leftJoin(article, eq(article.id, socialPost.articleId))
    .where(and(eq(socialPost.id, postId), eq(socialPost.userId, viewer.id)))
    .limit(1);
  if (!row) throw notFound("Post not found");
  const { post, story } = row;
  if (!story || story.status !== "published" || story.hiddenAt) throw new ApiError(409, "story_not_public", "This story isn't public any more, so it can't be posted again");
  if (post.status === "pending" || post.status === "waiting") throw new ApiError(409, "already_posting", "This story is being posted right now");
  if (post.status === "posted" && !post.removedAt) {
    const refused = await removeRemote(post);
    if (refused) {
      throw new ApiError(409, "remove_refused", "Couldn't remove the old post. Delete it in the app first, then tap Repost again.", { reason: refused });
    }
  }
  await db
    .update(socialPost)
    .set({
      // With the poster already made it goes now; without one, the story's cover is used right away.
      status: post.imageKey ? "pending" : "waiting",
      createdAt: post.imageKey ? post.createdAt : new Date(Date.now() - WAIT_FOR_POSTER_MS),
      remoteId: null,
      permalink: null,
      postedAt: null,
      removedAt: null,
      removeError: null,
      error: null,
      attempts: 0,
      nextAttemptAt: new Date(),
    })
    .where(eq(socialPost.id, post.id));
  wakeSocialPoster();
  return getSocialStatus(viewer);
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
    .select({ articleId: article.id, userId: socialPost.userId, coverKey: article.coverKey })
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
        ? await storeFeedImage(post.userId, story.id, await readStored(source), story)
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
    const permalink = await postPermalink(post.provider, token, remoteId);
    await db
      .update(socialPost)
      .set({ status: "posted", remoteId, permalink, storyTitle: story.title, error: null, postedAt: new Date(), attempts: post.attempts + 1 })
      .where(eq(socialPost.id, post.id));
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
      await removeDeletedStoryPosts();
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
