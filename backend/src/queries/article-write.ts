import { and, eq, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Transaction } from "../db/client.js";
import { article, user, type ArticleRecord } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { ApiError, notFound, validationError } from "../lib/errors.js";
import { publishEvent } from "../lib/events.js";
import { extractDomain, htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../lib/format.js";
import { sanitizeArticleHtml } from "../lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../lib/slug.js";
import { KEY_PATTERN, deleteQuietly, storage } from "../lib/storage.js";
import {
  BLURB,
  DEFAULT_POSTER_TEMPLATE,
  DISTRICT_CATEGORY,
  type GroupRole,
  subcategoryError,
  detectLanguage,
  LIMITS,
  districtError,
  type ArticleCategoryResult,
  type Role,
  type SaveArticleResponse,
  type articleCategorySchema,
  type saveArticleSchema,
} from "../shared/contracts.js";
import { findOwnedArticle, getPublishedDetailById, toDraftDetail } from "./articles.js";
import { notifyFollowers } from "./notifications.js";
import { pressMeetLocked, pressMeetStoryDeleted, pressMeetStorySaved } from "./press-meets.js";
import { enqueueSocialPosts } from "./social-accounts.js";
import { isUuid } from "./shared.js";

export type SaveArticleData = z.output<typeof saveArticleSchema>;
export type ArticleCategoryData = z.output<typeof articleCategorySchema>;

type CoverFields = Pick<ArticleRecord, "coverUrl" | "coverKey" | "coverWidth" | "coverHeight" | "coverBlur">;

const NO_COVER: CoverFields = { coverUrl: null, coverKey: null, coverWidth: null, coverHeight: null, coverBlur: null };

/** Validates a client-sent cover: it must be one of the author's own uploads. URL is rebuilt from the key. */
function resolveCover(cover: SaveArticleData["cover"], owners: readonly string[]): CoverFields {
  if (!cover) return NO_COVER;
  const invalid = () => validationError({ cover: "Please upload the cover image again" });
  if (!KEY_PATTERN.test(cover.key) || !owners.some((o) => cover.key.startsWith(`covers/${o}/`))) throw invalid();
  if (cover.url !== storage.urlFor(cover.key)) throw invalid();
  if (cover.blurDataUrl !== null && !cover.blurDataUrl.startsWith("data:image/")) throw invalid();
  return {
    coverUrl: storage.urlFor(cover.key),
    coverKey: cover.key,
    coverWidth: cover.width,
    coverHeight: cover.height,
    coverBlur: cover.blurDataUrl,
  };
}

type VideoFields = Pick<ArticleRecord, "videoUrl" | "videoKey" | "videoWidth" | "videoHeight" | "videoDurationMs">;

const NO_VIDEO: VideoFields = { videoUrl: null, videoKey: null, videoWidth: null, videoHeight: null, videoDurationMs: null };

/**
 * Validates a client-sent video (lib/video.ts output): one of the author's own `videos/` uploads, URL rebuilt from
 * the key. A video story needs its poster as the cover (the upload returns both).
 */
function resolveVideo(video: SaveArticleData["video"], owners: readonly string[], cover: CoverFields): VideoFields {
  if (!video) return NO_VIDEO;
  const invalid = () => validationError({ video: "Please upload the video again" });
  if (!KEY_PATTERN.test(video.key) || !owners.some((o) => video.key.startsWith(`videos/${o}/`))) throw invalid();
  if (video.url !== storage.urlFor(video.key)) throw invalid();
  if (!cover.coverKey) throw invalid();
  return {
    videoUrl: storage.urlFor(video.key),
    videoKey: video.key,
    videoWidth: video.width,
    videoHeight: video.height,
    videoDurationMs: video.durationMs,
  };
}

type ArticleImageFields = Pick<
  ArticleRecord,
  "articleImageUrl" | "articleImageKey" | "articleImageWidth" | "articleImageHeight" | "articleImageBlur"
>;

const NO_ARTICLE_IMAGE: ArticleImageFields = {
  articleImageUrl: null,
  articleImageKey: null,
  articleImageWidth: null,
  articleImageHeight: null,
  articleImageBlur: null,
};

/** The full article's 16:9 image (or its video's poster): one of the author's own `covers/` uploads, like the cover. */
function resolveArticleImage(image: SaveArticleData["articleImage"], owners: readonly string[]): ArticleImageFields {
  if (!image) return NO_ARTICLE_IMAGE;
  const invalid = () => validationError({ articleImage: "Please upload the article image again" });
  if (!KEY_PATTERN.test(image.key) || !owners.some((o) => image.key.startsWith(`covers/${o}/`))) throw invalid();
  if (image.url !== storage.urlFor(image.key)) throw invalid();
  if (image.blurDataUrl !== null && !image.blurDataUrl.startsWith("data:image/")) throw invalid();
  return {
    articleImageUrl: storage.urlFor(image.key),
    articleImageKey: image.key,
    articleImageWidth: image.width,
    articleImageHeight: image.height,
    articleImageBlur: image.blurDataUrl,
  };
}

type ArticleVideoFields = Pick<
  ArticleRecord,
  "articleVideoUrl" | "articleVideoKey" | "articleVideoWidth" | "articleVideoHeight" | "articleVideoDurationMs"
>;

const NO_ARTICLE_VIDEO: ArticleVideoFields = {
  articleVideoUrl: null,
  articleVideoKey: null,
  articleVideoWidth: null,
  articleVideoHeight: null,
  articleVideoDurationMs: null,
};

/** The full article's video: one of the author's own `videos/` uploads; its poster is the article image. */
function resolveArticleVideo(video: SaveArticleData["articleVideo"], owners: readonly string[], image: ArticleImageFields): ArticleVideoFields {
  if (!video) return NO_ARTICLE_VIDEO;
  const invalid = () => validationError({ articleVideo: "Please upload the article video again" });
  if (!KEY_PATTERN.test(video.key) || !owners.some((o) => video.key.startsWith(`videos/${o}/`))) throw invalid();
  if (video.url !== storage.urlFor(video.key)) throw invalid();
  if (!image.articleImageKey) throw invalid();
  return {
    articleVideoUrl: storage.urlFor(video.key),
    articleVideoKey: video.key,
    articleVideoWidth: video.width,
    articleVideoHeight: video.height,
    articleVideoDurationMs: video.durationMs,
  };
}

/** Shown after a Trainee's story is sent to the Review Desk. */
export const IN_REVIEW_MESSAGE = "Sent to the Review Desk — your story goes live as soon as an editor approves it.";

const alreadyPublished = () => new ApiError(409, "already_published", "A published story can't go back to drafts");

/** The author's own article, row-locked until the transaction ends (404 when missing or someone else's). */
async function lockOwned(tx: Transaction, id: string, authorId: string): Promise<ArticleRecord> {
  if (!isUuid(id)) throw notFound("Draft not found");
  const [row] = await tx
    .select()
    .from(article)
    .where(and(eq(article.id, id), eq(article.authorId, authorId)))
    .for("update")
    .limit(1);
  if (!row) throw notFound("Draft not found");
  return row;
}

/** Media files the save stopped using (deleted after commit when nothing else references them). */
type Replaced = { replacedKeys: Array<string | null> };

type WriteOutcome =
  | ({ kind: "draft"; row: ArticleRecord } & Replaced)
  | ({ kind: "group_review"; row: ArticleRecord } & Replaced)
  | ({ kind: "sent"; row: ArticleRecord; meetId: string; organizerName: string } & Replaced)
  | ({ kind: "in_review"; row: ArticleRecord } & Replaced)
  | ({ kind: "published"; id: string } & Replaced);

/**
 * Creates or updates an article from the composer's full state (every field is replaced by what is sent).
 * - `draft`: needs at least a title, a cover (or video), an article image (or video) or some text. Saving an in-review
 *   story as a draft withdraws it.
 * - `publish`: needs a cover image or a video (its poster is the cover) + an article image or video + title + ≥30
 *   chars of text; without a poster
 *   template it gets DEFAULT_POSTER_TEMPLATE. Verified reporters and the Editor Desk go live instantly (slug/publishedAt/
 *   short code + `article.published`); Trainees go to the Review Desk (`in_review`, invisible to the public, no realtime
 *   event until approved).
 * A published article is edited in place by `publish` (owner 2026-10-02): same link, followers aren't told again, any
 * role (no second review), `editedAt` shows "Updated" on the page; `draft` on it is 409 `already_published`. The status
 * check and the write happen in one transaction on the locked row, so an author's save racing a Review Desk approval
 * can't undo the approval.
 * A press meet story (`pressMeetId`, owner 2026-10-07) never goes live from here: `publish` sends it to the organizer
 * (it stays a draft until they verify it — queries/press-meets.ts), and once verified it can't be changed.
 */
/** A story hidden after too many reader reports (REPORT_RULES.hideAfter) can't go live — or to the Review Desk — again. */
const reportLocked = () =>
  new ApiError(409, "report_locked", "This story was hidden after too many reader reports, so it can't be published again.");

/** Posting as a group account (owner 2026-10-23): the member really writing, and their role in the group. */
export type GroupWriter = { id: string; role: GroupRole };

export const GROUP_REVIEW_MESSAGE = "Sent to the group's editors — it goes live as soon as one of them publishes it.";

/**
 * A group Writer may only touch their own stories that aren't live yet (owner 2026-10-23); editors and the owner may
 * touch any of the group's stories.
 */
function checkGroupWriter(writer: GroupWriter | undefined, existing: Pick<ArticleRecord, "status" | "postedById"> | null): void {
  if (writer?.role !== "writer" || !existing) return;
  if (existing.postedById !== writer.id) throw new ApiError(403, "group_role_forbidden", "This story was written by another member. Only an editor can change it.");
  if (existing.status === "published") throw new ApiError(403, "group_role_forbidden", "This story is live. Only an editor can change it now.");
}

export async function saveArticle(
  author: { id: string; needsReview: boolean; groupWriter?: GroupWriter; editorId?: string },
  input: SaveArticleData,
): Promise<SaveArticleResponse> {
  const authorId = author.id;
  // The Editor Desk editing someone's story (owner 2026-10-31): images it uploads sit in its own folder.
  const owners = author.editorId ? [authorId, author.editorId] : [authorId];
  const groupWriter = author.groupWriter;
  // Checked first so the author hears why, whatever else the form still lacks (re-checked under the row lock below).
  if (input.id && input.action !== "draft" && isUuid(input.id)) {
    const [row] = await db
      .select({ lockedAt: article.reportLockedAt })
      .from(article)
      .where(and(eq(article.id, input.id), eq(article.authorId, authorId)))
      .limit(1);
    if (row?.lockedAt) throw reportLocked();
  }

  const bodyHtml = sanitizeArticleHtml(input.bodyHtml ?? "");
  const bodyText = htmlToText(bodyHtml);
  if (bodyText.length > LIMITS.bodyTextMax) {
    throw validationError({ bodyHtml: `Keep the story under ${LIMITS.bodyTextMax.toLocaleString("en-US")} characters` });
  }
  const title = (input.title ?? "").trim() || null;
  const cover = resolveCover(input.cover, owners);
  const video = resolveVideo(input.video, owners, cover);
  const articleImage = resolveArticleImage(input.articleImage, owners);
  const articleVideo = resolveArticleVideo(input.articleVideo, owners, articleImage);
  const linkUrl = input.linkUrl ? input.linkUrl : null;
  const category = input.category ?? null;
  // Only Karnataka stories carry a district; a draft keeps one only while it is valid.
  const district = category === DISTRICT_CATEGORY && input.district && !districtError(category, input.district) ? input.district : null;
  // The story's language (the Languages menu, owner 2026-10-05): the reporter's pick, else read from the headline.
  const language = input.language ?? (title ? detectLanguage(title) : null);
  // A draft keeps the reporter's pick (or none yet); a story that goes live or to the Review Desk always has one.
  const template = input.template ?? (input.action === "draft" ? null : DEFAULT_POSTER_TEMPLATE);
  // The photo's place in the poster only means something with a photo.
  const frame = cover.coverKey ? (input.posterFrame ?? null) : null;
  // "Your frame" (owner 2026-10-08): the story takes the author's frame as it is now, and keeps it if they change frames
  // later. Any other template carries none.
  let overlay: { posterOverlayUrl: string | null; posterOverlayKey: string | null } = { posterOverlayUrl: null, posterOverlayKey: null };
  if (template === "own-frame") {
    const [owner] = await db
      .select({ url: user.posterOverlayUrl, key: user.posterOverlayKey })
      .from(user)
      .where(eq(user.id, authorId))
      .limit(1);
    if (owner?.url) overlay = { posterOverlayUrl: owner.url, posterOverlayKey: owner.key };
    else if (input.action !== "draft") throw validationError({ template: "Upload your frame first, or pick another template" });
  }

  // Sub category + blurb (owner 2026-10-14): Karnataka keeps its district instead of a sub category.
  const subcategory = category && category !== DISTRICT_CATEGORY && input.subcategory && !subcategoryError(category, input.subcategory) ? input.subcategory : null;
  const blurb = (input.blurb ?? "").replace(/\s+/g, " ").trim() || null;
  const fields = {
    title,
    subcategory,
    blurb,
    // "Read more link" stories (owner 2026-10-14) have no text of their own: "" (not null) so they can go live.
    bodyHtml: bodyHtml || (linkUrl ? "" : null),
    bodyText: bodyText || null,
    // The cards' text: the blurb when there is one, else the start of the story.
    excerpt: blurb ? makeExcerpt(blurb) : bodyText ? makeExcerpt(htmlToExcerptText(bodyHtml)) : null,
    readingMinutes: bodyText ? readingMinutes(bodyText) : null,
    linkUrl,
    linkDomain: extractDomain(linkUrl),
    category,
    district,
    language,
    template,
    posterX: frame?.x ?? null,
    posterY: frame?.y ?? null,
    posterZoom: frame?.zoom ?? null,
    premium: Boolean(input.premium),
    ...overlay,
    ...cover,
    ...video,
    ...articleImage,
    ...articleVideo,
    updatedAt: new Date(),
  };

  if (input.action === "draft") {
    if (!title && !cover.coverKey && !articleImage.articleImageKey && !bodyText && !linkUrl) {
      throw validationError({ title: "Add a headline, an image or some text before saving a draft" });
    }
  } else {
    const errors: Record<string, string> = {};
    if (!cover.coverKey) errors.cover = "Add a cover image or a video";
    if (!articleImage.articleImageKey) errors.articleImage = "Add an article image or video";
    if (!title) errors.title = "Add a headline";
    // A "Read more link" story (owner 2026-10-14) needs no description: the link is the story.
    if (!linkUrl && bodyText.length < LIMITS.bodyTextMin) errors.bodyHtml = `Write at least ${LIMITS.bodyTextMin} characters`;
    if (!category) errors.category = "Choose a category";
    const subcategoryIssue = subcategoryError(category, input.subcategory);
    if (subcategoryIssue) errors.subcategory = subcategoryIssue;
    if (!blurb || blurb.length < BLURB.min) errors.blurb = `Write a blurb of at least ${BLURB.min} characters`;
    const districtIssue = districtError(category, input.district);
    if (districtIssue) errors.district = districtIssue;
    if (Object.keys(errors).length > 0) throw validationError(errors, "Your story isn't ready to publish yet");
    if (input.premium) {
      // Members-only stories (owner 2026-10-14) need a price readers can buy a membership at.
      const [owner] = await db.select({ price: user.membershipPrice }).from(user).where(eq(user.id, authorId)).limit(1);
      if (!owner?.price) {
        throw new ApiError(422, "membership_price_required", "Set your membership price in Settings → Premium membership, then publish it as Premium.");
      }
    }
  }

  const write = (tx: Transaction): Promise<WriteOutcome> =>
    (async () => {
      const existing = input.id ? await lockOwned(tx, input.id, authorId) : null;
      checkGroupWriter(groupWriter, existing);
      if (existing?.pressMeetId && existing.status === "published") throw pressMeetLocked();
      if (existing?.status === "published" && input.action === "draft") throw alreadyPublished();
      if (existing?.reportLockedAt && input.action !== "draft") throw reportLocked();
      const kept = new Set([cover.coverKey, video.videoKey, articleImage.articleImageKey, articleVideo.articleVideoKey]);
      const replaced: Replaced = {
        replacedKeys: existing
          ? [existing.coverKey, existing.videoKey, existing.articleImageKey, existing.articleVideoKey].filter((key) => !kept.has(key))
          : [],
      };
      const id = existing?.id ?? null;

      // Written for a press meet: a draft until its organizer verifies it — `publish` sends it to them.
      const meetId = existing ? existing.pressMeetId : (input.pressMeetId ?? null);
      if (meetId) {
        const send = input.action !== "draft";
        const row = await upsertDraft(tx, authorId, id, { ...fields, pressMeetId: meetId });
        const { organizerName } = await pressMeetStorySaved(tx, { meetId, reporterId: authorId, articleId: row.id, title, send });
        return send ? { kind: "sent", row, meetId, organizerName, ...replaced } : { kind: "draft", row, ...replaced };
      }

      // A group story remembers the member who first wrote it (owner 2026-10-23).
      const postedBy = groupWriter && !existing ? { postedById: groupWriter.id } : {};
      if (input.action === "draft") {
        // Withdrawing from the Review Desk clears the submission; a returned story keeps its feedback. A writer saving
        // it again takes it back from the group's editors.
        const withdraw = {
          ...(existing?.status === "in_review" ? { submittedAt: null } : {}),
          ...(groupWriter?.role === "writer" ? { groupSubmittedAt: null } : {}),
        };
        return { kind: "draft", row: await upsertDraft(tx, authorId, id, { ...fields, ...withdraw, ...postedBy }), ...replaced };
      }
      // A group Writer's "publish" goes to the group's editors: it stays a draft until one of them publishes it.
      if (groupWriter?.role === "writer") {
        return { kind: "group_review", row: await upsertDraft(tx, authorId, id, { ...fields, ...postedBy, groupSubmittedAt: new Date() }), ...replaced };
      }
      if (existing?.status === "published") {
        return { kind: "published", id: await updatePublishedInTx(tx, existing.id, { ...fields, title: title as string }), ...replaced };
      }
      const live = { ...fields, ...postedBy, title: title as string, groupSubmittedAt: null };
      if (author.needsReview) {
        return { kind: "in_review", row: await submitForReview(tx, authorId, id, live), ...replaced };
      }
      return { kind: "published", id: await publishInTx(tx, authorId, id, live), ...replaced };
    })();

  let outcome: WriteOutcome | null = null;
  for (let attempt = 0; attempt < 4 && !outcome; attempt++) {
    try {
      outcome = await db.transaction(write);
    } catch (error) {
      if (isLinkCollision(error)) continue; // astronomically rare: retry with a new slug suffix / short code
      throw error;
    }
  }
  if (!outcome) throw new ApiError(500, "internal_error", "Could not generate a unique link for this story");
  await deleteMediaIfUnused(...outcome.replacedKeys);

  if (outcome.kind === "draft") return { status: "draft", article: { ...toDraftDetail(outcome.row), status: "draft", slug: null } };
  if (outcome.kind === "group_review") {
    return { status: "group_review", article: { ...toDraftDetail(outcome.row), status: "draft", slug: null }, message: GROUP_REVIEW_MESSAGE };
  }
  if (outcome.kind === "sent") {
    return {
      status: "sent",
      article: { ...toDraftDetail(outcome.row), status: "draft", slug: null },
      pressMeetId: outcome.meetId,
      message: `It goes live on WebNEWS once ${outcome.organizerName} verifies it.`,
    };
  }
  if (outcome.kind === "in_review") {
    return { status: "in_review", article: { ...toDraftDetail(outcome.row), status: "in_review", slug: null }, message: IN_REVIEW_MESSAGE };
  }
  const detail = await getPublishedDetailById(outcome.id, { id: authorId, role: "reporter" });
  if (!detail) throw new ApiError(500, "internal_error", "Published story could not be loaded");
  return { status: "published", article: { ...detail, status: "published" } };
}

type ArticleFields = Omit<typeof article.$inferInsert, "id" | "authorId" | "status" | "slug" | "shortCode" | "publishedAt">;

/**
 * Not live → no public link and no publish time (a returned / unpublished story may still carry old ones). The short
 * code is left alone: it belongs to the story for good, so links shared before an unpublish work again once it is back.
 */
const NOT_LIVE = { slug: null, publishedAt: null } as const;

async function upsertDraft(tx: Transaction, authorId: string, id: string | null, fields: ArticleFields): Promise<ArticleRecord> {
  if (id) {
    const [row] = await tx
      .update(article)
      .set({ ...fields, ...NOT_LIVE, status: "draft" })
      .where(and(eq(article.id, id), ne(article.status, "published")))
      .returning();
    if (!row) throw alreadyPublished();
    return row;
  }
  const [row] = await tx
    .insert(article)
    .values({ ...fields, authorId, status: "draft" })
    .returning();
  if (!row) throw new ApiError(500, "internal_error", "Draft could not be saved");
  return row;
}

/** Trainee publish: the story waits at the Review Desk (resubmitting clears any earlier feedback). */
async function submitForReview(tx: Transaction, authorId: string, id: string | null, fields: ArticleFields & { title: string }): Promise<ArticleRecord> {
  const now = new Date();
  const values = { ...fields, ...NOT_LIVE, status: "in_review" as const, submittedAt: now, returnedAt: null, reviewNote: null, updatedAt: now };
  const [row] = id
    ? await tx
        .update(article)
        .set(values)
        .where(and(eq(article.id, id), ne(article.status, "published")))
        .returning()
    : await tx
        .insert(article)
        .values({ ...values, authorId, createdAt: now })
        .returning();
  if (!row) throw id ? alreadyPublished() : notFound("Draft not found");
  return row;
}

/**
 * Verified publish: a fresh slug every time, while the short code is given only once — a story that already has one
 * (re-published after an unpublish, or backfilled while it waited at the Review Desk) keeps it.
 */
async function publishInTx(tx: Transaction, authorId: string, id: string | null, fields: ArticleFields & { title: string }): Promise<string> {
  const now = new Date();
  const values = { ...fields, status: "published" as const, slug: makeSlug(fields.title), publishedAt: now, editedAt: null, updatedAt: now, returnedAt: null, reviewNote: null };
  const shortCode = makeShortCode();
  const [row] = id
    ? await tx
        .update(article)
        .set({ ...values, shortCode: sql`coalesce(${article.shortCode}, ${shortCode})` })
        .where(and(eq(article.id, id), ne(article.status, "published")))
        .returning({ id: article.id })
    : await tx
        .insert(article)
        .values({ ...values, shortCode, authorId, createdAt: now })
        .returning({ id: article.id });
  if (!row) throw id ? alreadyPublished() : notFound("Draft not found");
  await notifyFollowers(tx, row.id);
  // Connected Instagram / Facebook Page (verified reporters): queued, sent once the poster arrives.
  await enqueueSocialPosts(tx, row.id, authorId);
  await publishEvent(tx, { t: "article.published", id: row.id });
  return row.id;
}

/** Edit of a live story: its link, publish time and short code stay; followers aren't notified again. */
async function updatePublishedInTx(tx: Transaction, id: string, fields: ArticleFields & { title: string }): Promise<string> {
  const now = new Date();
  const [row] = await tx
    .update(article)
    .set({ ...fields, editedAt: now, updatedAt: now })
    .where(and(eq(article.id, id), eq(article.status, "published")))
    .returning({ id: article.id });
  if (!row) throw notFound("Story not found");
  return row.id;
}

/**
 * Removes a story's media files (cover, video, article image / video) once no article references them any more, in
 * any media column (best-effort, after commit).
 */
export async function deleteMediaIfUnused(...keys: Array<string | null>): Promise<void> {
  for (const key of new Set(keys)) {
    if (!key) continue;
    try {
      const [stillUsed] = await db
        .select({ id: article.id })
        .from(article)
        .where(
          or(
            eq(article.coverKey, key),
            eq(article.videoKey, key),
            eq(article.articleImageKey, key),
            eq(article.articleVideoKey, key),
          ),
        )
        .limit(1);
      if (!stillUsed) await deleteQuietly(key);
    } catch (error) {
      console.warn("[storage] media cleanup skipped:", error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Moves a story to another category (Karnataka: and district) — published ones too, which the composer can't
 * edit. Its author (any role, like delete) or the Editor Desk for anyone's story (audited). null = not found / not theirs.
 */
export async function setArticleCategory(
  actor: { id: string; role: Role },
  id: string,
  input: ArticleCategoryData,
): Promise<ArticleCategoryResult | null> {
  if (!isUuid(id)) return null;
  const district = input.category === DISTRICT_CATEGORY ? input.district : null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ authorId: article.authorId, title: article.title, category: article.category, status: article.status, pressMeetId: article.pressMeetId })
      .from(article)
      .where(eq(article.id, id))
      .for("update")
      .limit(1);
    if (!row) return null;
    const own = row.authorId === actor.id;
    if (!own && actor.role !== "admin") return null;
    // A verified press meet story is locked for its author (the Editor Desk can still refile it).
    if (own && actor.role !== "admin" && row.pressMeetId && row.status === "published") throw pressMeetLocked();
    await tx.update(article).set({ category: input.category, district }).where(eq(article.id, id));
    if (!own) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: "story.category",
        targetType: "article",
        targetId: id,
        targetLabel: row.title,
        meta: { from: row.category, to: input.category, district },
      });
    }
    return { id, category: input.category, district };
  });
}

/** Deletes one of the author's articles (draft or published). Returns false when not found / not theirs. */
export async function deleteArticle(authorId: string, id: string, groupWriter?: GroupWriter): Promise<boolean> {
  const existing = await findOwnedArticle(id, authorId);
  if (!existing) return false;
  checkGroupWriter(groupWriter, existing);
  await db.transaction(async (tx) => {
    // A verified press meet story is locked; one not verified yet frees the reporter's invitation.
    if (existing.pressMeetId) {
      const locked = await lockOwned(tx, existing.id, authorId);
      if (locked.status === "published") throw pressMeetLocked();
      await pressMeetStoryDeleted(tx, existing.id, existing.pressMeetId);
    }
    await tx.delete(article).where(eq(article.id, existing.id));
    if (existing.status === "published") await publishEvent(tx, { t: "article.deleted", id: existing.id });
  });
  await deleteMediaIfUnused(existing.coverKey, existing.videoKey, existing.articleImageKey, existing.articleVideoKey);
  return true;
}
