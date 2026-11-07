import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { db } from "../db/client.js";
import { apiKey, apiPost, article, user } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, notFound, validationError } from "../lib/errors.js";
import { htmlToText } from "../lib/format.js";
import { processImage } from "../lib/images.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import {
  canPublish,
  needsReview,
  toReporterLevel,
  toRole,
} from "../lib/roles.js";
import { deleteQuietly, newImageKey, storage } from "../lib/storage.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireReporter } from "../middleware/guards.js";
import { deleteArticle, saveArticle } from "../queries/article-write.js";
import { logContent } from "../queries/content-log.js";
import {
  BLURB,
  CATEGORY_VALUES,
  LIMITS,
  PRESS_LANGUAGE_VALUES,
  SUBCATEGORIES,
  type Category,
} from "../shared/contracts.js";
import type { AppEnv, Viewer } from "../types.js";
import type { RouteDeps } from "./deps.js";

/*
 * Publishing API (owner 2026-11-04: "same like Meta — they add our API to their own website, and an article they post
 * there is published here too"). A Press Pass holder makes a key in Settings → Publishing API; their website / CMS
 * sends `Authorization: Bearer wnx_live_…` to /api/v1/*. A story posted this way goes through the same rules as the
 * composer (Trainees → Review Desk, group reporters' limits don't apply: keys are personal).
 */

const KEY_PREFIX = "wnx_live_";
const MAX_KEYS = 5;
const IMAGE_MAX_BYTES = LIMITS.uploadMaxBytes;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/* ───────────── Fetching the story's image from the sender's website (never from our own network) ───────────── */

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv6");

async function publicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true }).catch(() => []);
  // An IPv4-mapped IPv6 address (::ffff:10.0.0.1) is checked as the IPv4 it carries.
  const blocked = (address: string, family: number) => {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
    return mapped
      ? PRIVATE.check(mapped, "ipv4")
      : PRIVATE.check(address, family === 6 ? "ipv6" : "ipv4");
  };
  return (
    addresses.length > 0 &&
    addresses.every((a) => !blocked(a.address, a.family))
  );
}

/** Downloads an image (http/https, public hosts only, ≤ 8 MB, up to 3 redirects, each checked). */
async function downloadImage(raw: string): Promise<Buffer> {
  const bad = (message: string) =>
    validationError({ imageUrl: message }, message);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad("imageUrl must be a full link to an image");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw bad("imageUrl must be an http(s) link");
    if (!(await publicHost(url.hostname)))
      throw bad("imageUrl must be on a public website");
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "WebNewsX-PublishingAPI/1.0",
        Accept: "image/*",
      },
    }).catch(() => null);
    if (!res) throw bad("Couldn't download the image");
    const location =
      res.status >= 300 && res.status < 400
        ? res.headers.get("location")
        : null;
    if (location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body)
      throw bad(`Couldn't download the image (${res.status})`);
    if (Number(res.headers.get("content-length") ?? 0) > IMAGE_MAX_BYTES)
      throw bad("The image must be 8 MB or smaller");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > IMAGE_MAX_BYTES)
        throw bad("The image must be 8 MB or smaller");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw bad("The image link redirects too many times");
}

/* ─────────────────────────────── Keys (Settings → Publishing API, signed in) ─────────────────────────────── */

const keyNameSchema = z.object({
  name: z.string().trim().min(1, "Name the key").max(60),
});

export function apiKeyRoutes(_deps: RouteDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", requireReporter);

  // GET /api/api-keys — the account's keys (never the key itself) + the latest stories posted through the API.
  app.get("/", async (c) => {
    const viewer = mustViewer(c);
    const [keys, posts] = await Promise.all([
      db
        .select({
          id: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          createdAt: apiKey.createdAt,
          lastUsedAt: apiKey.lastUsedAt,
        })
        .from(apiKey)
        .where(and(eq(apiKey.userId, viewer.id), isNull(apiKey.revokedAt)))
        .orderBy(desc(apiKey.createdAt)),
      db
        .select({
          id: article.id,
          title: article.title,
          status: article.status,
          slug: article.slug,
          keyName: apiKey.name,
          createdAt: apiPost.createdAt,
        })
        .from(apiPost)
        .innerJoin(article, eq(article.id, apiPost.articleId))
        .leftJoin(apiKey, eq(apiKey.id, apiPost.keyId))
        .where(eq(apiPost.userId, viewer.id))
        .orderBy(desc(apiPost.createdAt))
        .limit(10),
    ]);
    return c.json({ keys, posts, endpoint: `${env.FRONTEND_URL}/api/v1` });
  });

  // POST /api/api-keys { name } — a new key, shown once.
  app.post("/", async (c) => {
    const viewer = mustViewer(c);
    if (viewer.actor)
      throw new ApiError(
        403,
        "forbidden",
        "Switch back to your own account to make an API key",
      );
    const { name } = await readJson(c, keyNameSchema);
    const live = await db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.userId, viewer.id), isNull(apiKey.revokedAt)));
    if (live.length >= MAX_KEYS)
      throw new ApiError(
        400,
        "too_many_keys",
        `You can have ${MAX_KEYS} keys. Delete one first.`,
      );
    const key = KEY_PREFIX + randomBytes(24).toString("base64url");
    const [row] = await db
      .insert(apiKey)
      .values({
        userId: viewer.id,
        name,
        prefix: key.slice(0, KEY_PREFIX.length + 4),
        hash: hashKey(key),
      })
      .returning({
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
      });
    return c.json({ ...row, key }, 201);
  });

  // DELETE /api/api-keys/:id — the key stops working at once (stories it posted stay).
  app.delete("/:id", async (c) => {
    const viewer = mustViewer(c);
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success)
      throw notFound("Key not found");
    const [row] = await db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKey.id, id),
          eq(apiKey.userId, viewer.id),
          isNull(apiKey.revokedAt),
        ),
      )
      .returning({ id: apiKey.id });
    if (!row) throw notFound("Key not found");
    return c.body(null, 204);
  });

  return app;
}

/* ─────────────────────────────── The API itself (/api/v1, Bearer key) ─────────────────────────────── */

const storySchema = z.object({
  /** Your own id for the story (e.g. your CMS post id): sending the same id again updates that story. */
  externalId: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(5).max(LIMITS.titleMax),
  /** The story: HTML (<p>, <h2>, <ul>, <a>, <img>…, cleaned like the composer) or plain text (blank lines = paragraphs). */
  body: z.string().min(1).max(200_000),
  /** The 2-line summary under the headline; left out → the story's first sentences. */
  blurb: z.string().trim().max(BLURB.hardMax).optional(),
  /** The story's photo (JPEG / PNG / WebP, ≤ 8 MB) — downloaded and kept on WebNewsX. */
  imageUrl: z.string().trim().min(1).max(2000),
  category: z.enum(CATEGORY_VALUES),
  /** One of the category's sub categories (GET /api/v1/categories); left out → "Other". */
  subcategory: z.string().trim().max(60).optional(),
  /** Karnataka stories: the district (or "All Karnataka"). */
  district: z.string().trim().max(60).optional(),
  language: z.enum(PRESS_LANGUAGE_VALUES).optional(),
  /** The original story on your website ("Read more" link). */
  sourceUrl: z.string().trim().url().max(LIMITS.linkMax).optional(),
  /** true → saved as a draft in your Newsroom instead of going live. */
  draft: z.boolean().optional(),
  /**
   * Goes live by itself at this time (ISO 8601, 5 min – 30 days ahead), like the composer's Schedule (owner
   * 2026-11-07: a day's stories queued in the morning and posted through the day). Kept as a draft until then.
   */
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text → paragraphs; HTML is passed through (saveArticle cleans it). */
const toHtml = (body: string) =>
  /<\/?[a-z][\s\S]*>/i.test(body)
    ? body
    : body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
        .join("");

/** The first sentences of the story, BLURB.min…300 characters. */
function blurbFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 300) return clean;
  const cut = clean.slice(0, 300);
  const end = cut.lastIndexOf(". ");
  return end >= BLURB.min
    ? cut.slice(0, end + 1)
    : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Bearer key → the account (as `viewer`, so Reporter activity and every rule work as in the composer). */
async function authenticate(
  c: Context<AppEnv>,
): Promise<Viewer & { keyId: string }> {
  const header = c.req.header("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith(KEY_PREFIX))
    throw new ApiError(
      401,
      "invalid_key",
      "Send your API key as: Authorization: Bearer wnx_live_…",
    );
  const [row] = await db
    .select({ keyId: apiKey.id, revokedAt: apiKey.revokedAt, u: user })
    .from(apiKey)
    .innerJoin(user, eq(user.id, apiKey.userId))
    .where(eq(apiKey.hash, hashKey(key)))
    .limit(1);
  if (!row || row.revokedAt)
    throw new ApiError(
      401,
      "invalid_key",
      "This API key doesn't work (deleted or mistyped)",
    );
  const u = row.u;
  if (u.suspendedAt)
    throw new ApiError(403, "account_suspended", "This account is suspended");
  const viewer: Viewer = {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    image: u.image ?? null,
    username: u.username ?? null,
    bio: u.bio ?? null,
    onboardedAt: u.onboardedAt ?? null,
    onboarded: Boolean(u.onboardedAt),
    role: toRole(u.role),
    reporterLevel: toReporterLevel(u.reporterLevel),
  };
  if (!canPublish(viewer))
    throw new ApiError(
      403,
      "press_pass_required",
      "This account's Press Pass isn't active",
    );
  c.set("viewer", viewer);
  void db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, row.keyId))
    .catch(() => {});
  return { ...viewer, keyId: row.keyId };
}

const storyUrl = (slug: string | null) =>
  slug ? `${env.FRONTEND_URL}/a/${slug}` : null;

export function publishApiRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  // Any website may call it (no cookies: the key is the only credential).
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  // GET /api/v1/me — check a key: whose it is.
  app.get("/me", async (c) => {
    const viewer = await authenticate(c);
    return c.json({
      id: viewer.id,
      username: viewer.username,
      name: viewer.name,
      reporterLevel: viewer.reporterLevel,
      reviewed: needsReview(viewer),
    });
  });

  // GET /api/v1/categories — the categories and their sub categories.
  app.get("/categories", (c) =>
    c.json({
      categories: CATEGORY_VALUES.map((value) => ({
        value,
        subcategories:
          value === "karnataka"
            ? []
            : SUBCATEGORIES[value as Exclude<Category, "karnataka">],
        needsDistrict: value === "karnataka",
      })),
    }),
  );

  // POST /api/v1/articles — publish (or update, same externalId) a story.
  app.post("/articles", async (c) => {
    const viewer = await authenticate(c);
    const input = await readJson(c, storySchema);
    const [existing] = input.externalId
      ? await db
          .select({ articleId: apiPost.articleId })
          .from(apiPost)
          .where(
            and(
              eq(apiPost.userId, viewer.id),
              eq(apiPost.externalId, input.externalId),
            ),
          )
          .limit(1)
      : [];
    if (!existing) {
      const hit = limiter.hit(
        `article-create|u:${viewer.id}`,
        RATE_LIMITS.articleCreate,
      );
      if (!hit.allowed) {
        c.header("Retry-After", String(hit.retryAfterSec));
        throw new ApiError(
          429,
          "rate_limited",
          "Too many new stories. Try again later.",
        );
      }
    }

    const image = await processImage(
      await downloadImage(input.imageUrl),
      "article",
    ).catch((error: unknown) => {
      if (error instanceof ApiError)
        throw validationError({ imageUrl: error.message }, error.message);
      throw validationError(
        { imageUrl: "That isn't an image we can use" },
        "That isn't an image we can use",
      );
    });
    const key = newImageKey("cover", viewer.id);
    const url = await storage.put(key, image.buffer, image.contentType);
    const cover = {
      url,
      key,
      width: image.width,
      height: image.height,
      blurDataUrl: image.blurDataUrl,
    };

    const bodyHtml = toHtml(input.body);
    const category = input.category;
    let result;
    try {
      result = await saveArticle(
        { id: viewer.id, needsReview: needsReview(viewer) },
        {
          id: existing?.articleId,
          title: input.title,
          bodyHtml,
          cover,
          articleImage: cover,
          linkUrl: input.sourceUrl ?? null,
          category,
          subcategory:
            category === "karnataka" ? null : (input.subcategory ?? "Other"),
          district: category === "karnataka" ? (input.district ?? null) : null,
          language: input.language ?? null,
          blurb: input.blurb || blurbFrom(htmlToText(bodyHtml)),
          premium: false,
          action: input.draft ? "draft" : "publish",
          scheduledAt: input.draft ? undefined : input.scheduledAt,
        },
      );
    } catch (error) {
      await deleteQuietly(key);
      throw error;
    }
    const a = result.article;
    if (!existing) {
      await db
        .insert(apiPost)
        .values({
          articleId: a.id,
          userId: viewer.id,
          keyId: viewer.keyId,
          externalId: input.externalId ?? null,
        });
    }
    const action =
      result.status === "published"
        ? existing
          ? "edited"
          : "published"
        : result.status === "in_review"
          ? "submitted"
          : "draft_saved"; // a scheduled story is a draft until its time (as in the composer)
    await logContent(c, action, {
      id: a.id,
      title: a.title ?? null,
      slug: a.slug ?? null,
    });
    return c.json(
      {
        id: a.id,
        externalId: input.externalId ?? null,
        status: result.status,
        url: storyUrl(a.slug ?? null),
        ...("scheduledAt" in result ? { scheduledAt: result.scheduledAt } : {}),
        ...("message" in result ? { message: result.message } : {}),
      },
      existing ? 200 : 201,
    );
  });

  // GET /api/v1/articles — the latest stories posted through the API (newest first, up to 50).
  app.get("/articles", async (c) => {
    const viewer = await authenticate(c);
    const rows = await db
      .select({
        id: article.id,
        externalId: apiPost.externalId,
        title: article.title,
        status: article.status,
        slug: article.slug,
        createdAt: apiPost.createdAt,
      })
      .from(apiPost)
      .innerJoin(article, eq(article.id, apiPost.articleId))
      .where(eq(apiPost.userId, viewer.id))
      .orderBy(desc(apiPost.createdAt))
      .limit(50);
    return c.json({
      items: rows.map(({ slug, ...r }) => ({
        ...r,
        url: r.status === "published" ? storyUrl(slug) : null,
      })),
    });
  });

  // DELETE /api/v1/articles/:id — :id = our id, or `ext:<your externalId>`.
  app.delete("/articles/:id", async (c) => {
    const viewer = await authenticate(c);
    const param = c.req.param("id");
    const where = param.startsWith("ext:")
      ? and(
          eq(apiPost.userId, viewer.id),
          eq(apiPost.externalId, param.slice(4)),
        )
      : z.string().uuid().safeParse(param).success
        ? and(eq(apiPost.userId, viewer.id), eq(apiPost.articleId, param))
        : null;
    const [row] = where
      ? await db
          .select({ id: article.id, title: article.title, slug: article.slug })
          .from(apiPost)
          .innerJoin(article, eq(article.id, apiPost.articleId))
          .where(where)
          .limit(1)
      : [];
    if (!row || !(await deleteArticle(viewer.id, row.id)))
      throw notFound("Story not found");
    await logContent(c, "deleted", {
      id: row.id,
      title: row.title,
      slug: row.slug,
    });
    return c.body(null, 204);
  });

  return app;
}
