import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { article, contentLog, user } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, notFound } from "../lib/errors.js";
import { publishEvent } from "../lib/events.js";
import { htmlToText, makeExcerpt, readingMinutes } from "../lib/format.js";
import { processImage } from "../lib/images.js";
import { sanitizeArticleHtml } from "../lib/sanitize.js";
import { makeShortCode, makeSlug } from "../lib/slug.js";
import { newImageKey, storage } from "../lib/storage.js";
import { readJson } from "../lib/validate.js";
import { notifyFollowers } from "../queries/notifications.js";
import { BLURB, CATEGORY_VALUES, LIMITS, PRESS_LANGUAGE_VALUES } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/** Only openly licensed sources' images (PIB: Government of India, free to reuse with credit). */
const IMAGE_HOSTS = new Set(["static.pib.gov.in", "upload.wikimedia.org"]);

const storySchema = z.object({
  title: z.string().trim().min(10).max(LIMITS.titleMax),
  blurb: z.string().trim().min(BLURB.min).max(BLURB.hardMax),
  paragraphs: z.array(z.string().trim().min(1).max(3000)).min(2).max(12),
  imageUrl: z.string().url().max(800),
  /** Shown at the end of the story: "Source: … · Photo: …". */
  sourceName: z.string().trim().min(2).max(120),
  photoCredit: z.string().trim().min(2).max(120),
  category: z.enum(CATEGORY_VALUES),
  subcategory: z.string().trim().max(40).nullable().optional(),
  district: z.string().trim().max(60).nullable().optional(),
  language: z.enum(PRESS_LANGUAGE_VALUES).default("en"),
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function authorized(header: string | undefined): boolean {
  if (!env.IMPORT_TOKEN || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(env.IMPORT_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST /api/import/story (owner 2026-10-31) — the scheduled morning run publishes a story here under the site's own
 * account (IMPORT_AUTHOR_USERNAME, @webnews.in). Bearer IMPORT_TOKEN only; the image must be from an openly licensed
 * source and is copied into our storage; a headline already published by that account is skipped (repeat runs are
 * safe). Followers are notified like any new story, and it's written to Reporter activity.
 */
export function importRoutes() {
  const app = new Hono<AppEnv>();

  app.post("/story", async (c) => {
    if (!authorized(c.req.header("authorization"))) throw new ApiError(401, "unauthorized", "Not allowed");
    const input = await readJson(c, storySchema);
    const [author] = await db.select({ id: user.id, username: user.username }).from(user).where(eq(user.username, env.IMPORT_AUTHOR_USERNAME)).limit(1);
    if (!author) throw notFound("Import account not found");

    const [dup] = await db
      .select({ slug: article.slug })
      .from(article)
      .where(and(eq(article.authorId, author.id), eq(article.title, input.title)))
      .limit(1);
    if (dup) return c.json({ status: "skipped", reason: "already published", slug: dup.slug });

    const url = new URL(input.imageUrl);
    if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname)) throw new ApiError(400, "image_not_allowed", "Images must come from an openly licensed source");
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (WebNEWS import)" } }).catch(() => null);
    if (!res?.ok) throw new ApiError(400, "image_unavailable", "Couldn't download the image");
    const image = await processImage(Buffer.from(await res.arrayBuffer()), "article");
    const key = newImageKey("cover", author.id);
    const imageUrl = await storage.put(key, image.buffer, image.contentType);

    const credit = `<p><em>Source: ${esc(input.sourceName)}. Photo: ${esc(input.photoCredit)}.</em></p>`;
    const bodyHtml = sanitizeArticleHtml(input.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("") + credit);
    const bodyText = htmlToText(bodyHtml);
    const now = new Date();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(article).values({
        id,
        authorId: author.id,
        status: "published",
        title: input.title,
        bodyHtml,
        bodyText,
        blurb: input.blurb,
        excerpt: makeExcerpt(input.blurb),
        coverUrl: imageUrl,
        coverKey: key,
        coverWidth: image.width,
        coverHeight: image.height,
        coverBlur: image.blurDataUrl,
        articleImageUrl: imageUrl,
        articleImageKey: key,
        articleImageWidth: image.width,
        articleImageHeight: image.height,
        articleImageBlur: image.blurDataUrl,
        category: input.category,
        subcategory: input.category === "karnataka" ? null : (input.subcategory ?? "Other"),
        district: input.category === "karnataka" ? (input.district ?? null) : null,
        language: input.language,
        template: "classic",
        slug: makeSlug(input.title),
        shortCode: makeShortCode(),
        readingMinutes: readingMinutes(bodyText),
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      });
      await notifyFollowers(tx, id);
      await publishEvent(tx, { t: "article.published", id });
      await tx.insert(contentLog).values({
        userId: author.id,
        username: author.username,
        actorUsername: "scheduled-import",
        action: "published",
        articleId: id,
        articleTitle: input.title,
        ip: c.get("clientIp") || null,
        userAgent: c.req.header("user-agent")?.slice(0, 500) ?? "scheduled-import",
      });
    });
    const [row] = await db.select({ slug: article.slug, shortCode: article.shortCode }).from(article).where(eq(article.id, id)).limit(1);
    return c.json({ status: "published", id, slug: row?.slug, url: `${env.FRONTEND_URL}/a/${row?.slug}` }, 201);
  });

  return app;
}
