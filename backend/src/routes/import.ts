import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { article, contentLog, siteSetting, user } from "../db/schema.js";
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
import {
  BLURB,
  CATEGORY_VALUES,
  LIMITS,
  PRESS_LANGUAGE_VALUES,
  districtError,
} from "../shared/contracts.js";
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
  /** Post as this verified reporter instead of the site's own account (owner 2026-11-02: reporters who agreed). */
  authorUsername: z.string().trim().max(40).nullable().optional(),
  /** Publish later (ISO time): the server queues it and publishes it then (owner 2026-11-02). */
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function authorized(header: string | undefined): boolean {
  if (!env.IMPORT_TOKEN || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(env.IMPORT_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A story for the import, as sent (one shape for "now" and for a queued later publish). */
export type ImportStory = z.output<typeof storySchema>;

/** Checks the author and district before a story is published or queued (throws the same errors as the route). */
async function checkAuthor(input: ImportStory) {
  const username = input.authorUsername || env.IMPORT_AUTHOR_USERNAME;
  const [author] = await db
    .select({
      id: user.id,
      username: user.username,
      reporterLevel: user.reporterLevel,
      suspendedAt: user.suspendedAt,
    })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (!author) throw notFound("Import account not found");
  if (
    input.authorUsername &&
    (author.reporterLevel !== "verified" || author.suspendedAt)
  ) {
    throw new ApiError(
      400,
      "author_not_allowed",
      "Only verified, active reporters can be posted as",
    );
  }
  if (
    input.category === "karnataka" &&
    districtError("karnataka", input.district ?? null)
  ) {
    throw new ApiError(
      400,
      "invalid_district",
      "Choose a Karnataka district (or All Karnataka)",
    );
  }
  return author;
}

/** Publishes one imported story now (the route, and the queue worker for stories sent with `publishAt`). */
export async function publishImport(
  input: ImportStory,
  meta: { ip: string | null; userAgent: string },
): Promise<
  | { status: "published"; id: string; slug?: string; url: string }
  | { status: "skipped"; reason: string; slug: string }
> {
  const author = await checkAuthor(input);
  const [dup] = await db
    .select({ slug: article.slug })
    .from(article)
    .where(and(eq(article.authorId, author.id), eq(article.title, input.title)))
    .limit(1);
  if (dup)
    return {
      status: "skipped",
      reason: "already published",
      slug: dup.slug ?? "",
    };

  const url = new URL(input.imageUrl);
  if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname))
    throw new ApiError(
      400,
      "image_not_allowed",
      "Images must come from an openly licensed source",
    );
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "Mozilla/5.0 (WebNewsX import)" },
  }).catch(() => null);
  if (!res?.ok)
    throw new ApiError(400, "image_unavailable", "Couldn't download the image");
  const image = await processImage(
    Buffer.from(await res.arrayBuffer()),
    "article",
  );
  const key = newImageKey("cover", author.id);
  const imageUrl = await storage.put(key, image.buffer, image.contentType);

  const credit = `<p><em>Source: ${esc(input.sourceName)}. Photo: ${esc(input.photoCredit)}.</em></p>`;
  const bodyHtml = sanitizeArticleHtml(
    input.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("") + credit,
  );
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
      subcategory:
        input.category === "karnataka" ? null : (input.subcategory ?? "Other"),
      district:
        input.category === "karnataka" ? (input.district ?? null) : null,
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
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });
  const [row] = await db
    .select({ slug: article.slug })
    .from(article)
    .where(eq(article.id, id))
    .limit(1);
  return {
    status: "published",
    id,
    slug: row?.slug ?? undefined,
    url: `${env.FRONTEND_URL}/a/${row?.slug ?? ""}`,
  };
}

/**
 * Publishing later (owner 2026-11-02: "1 by 1 every 30 minutes, with my laptop closed"): a story sent with `publishAt`
 * is kept on the server (site_setting "import_queue") and the worker below publishes it when its time comes.
 */
const QUEUE_KEY = "import_queue";
type Queued = { id: string; publishAt: string; story: ImportStory };

async function readQueue(): Promise<Queued[]> {
  const [row] = await db
    .select({ value: siteSetting.value })
    .from(siteSetting)
    .where(eq(siteSetting.key, QUEUE_KEY))
    .limit(1);
  return Array.isArray(row?.value) ? (row.value as Queued[]) : [];
}
async function writeQueue(items: Queued[]): Promise<void> {
  await db
    .insert(siteSetting)
    .values({ key: QUEUE_KEY, value: items, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSetting.key,
      set: { value: items, updatedAt: new Date() },
    });
}

/** Every minute: publish the queued stories that are due (oldest first). Returns the stop function (src/index.ts). */
export function startImportQueue(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const queue = await readQueue();
      const now = Date.now();
      const due = queue
        .filter((q) => Date.parse(q.publishAt) <= now)
        .sort((x, y) => Date.parse(x.publishAt) - Date.parse(y.publishAt));
      if (due.length > 0) {
        // Take them off the queue first, so a slow publish never runs twice.
        await writeQueue(queue.filter((q) => !due.includes(q)));
        for (const item of due) {
          const result = await publishImport(item.story, {
            ip: null,
            userAgent: "scheduled-import",
          }).catch((error: unknown) => ({
            status: "failed",
            reason: error instanceof Error ? error.message : String(error),
          }));
          console.log(
            `[import] queued story "${item.story.title.slice(0, 60)}": ${result.status}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        "[import] queue failed:",
        error instanceof Error ? error.message : error,
      );
    }
    running = false;
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

/**
 * POST /api/import/story (owner 2026-10-31) — the scheduled morning run publishes a story here under the site's own
 * account (IMPORT_AUTHOR_USERNAME, @webnews.in), or a verified reporter named in `authorUsername`. Bearer IMPORT_TOKEN only; the image must be from an openly licensed
 * source and is copied into our storage; a headline already published by that account is skipped (repeat runs are
 * safe). Followers are notified like any new story, and it's written to Reporter activity.
 */
export function importRoutes() {
  const app = new Hono<AppEnv>();

  app.post("/story", async (c) => {
    if (!authorized(c.req.header("authorization")))
      throw new ApiError(401, "unauthorized", "Not allowed");
    const input = await readJson(c, storySchema);
    // Later: queue it on the server (checked now, published by the worker when due).
    if (input.publishAt && Date.parse(input.publishAt) > Date.now() + 30_000) {
      await checkAuthor(input);
      const queue = await readQueue();
      const id = randomUUID();
      await writeQueue([
        ...queue,
        {
          id,
          publishAt: new Date(input.publishAt).toISOString(),
          story: input,
        },
      ]);
      return c.json(
        {
          status: "scheduled",
          id,
          publishAt: new Date(input.publishAt).toISOString(),
        },
        202,
      );
    }
    const result = await publishImport(input, {
      ip: c.get("clientIp") || null,
      userAgent:
        c.req.header("user-agent")?.slice(0, 500) ?? "scheduled-import",
    });
    return c.json(result, result.status === "published" ? 201 : 200);
  });

  // GET /api/import/queue — the stories waiting to be published (titles and times).
  app.get("/queue", async (c) => {
    if (!authorized(c.req.header("authorization")))
      throw new ApiError(401, "unauthorized", "Not allowed");
    const queue = await readQueue();
    return c.json({
      items: queue.map((q) => ({
        id: q.id,
        publishAt: q.publishAt,
        title: q.story.title,
        author: q.story.authorUsername ?? null,
      })),
    });
  });

  return app;
}
