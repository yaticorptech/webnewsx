import { Hono } from "hono";
import { db } from "../db/client.js";
import { writeAudit } from "../lib/audit.js";
import { ApiError, notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { needsReview } from "../lib/roles.js";
import { readJson } from "../lib/validate.js";
import { clampLimit } from "../queries/shared.js";
import { ensureViewerKey, viewerKeyOf } from "../lib/viewer-id.js";
import { mustViewer, requireOnboarded, requireReporter, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { deleteArticle, saveArticle, setArticleCategory } from "../queries/article-write.js";
import { addComment, deleteComment, listComments, listReplies, setCommentLike } from "../queries/comments.js";
import { findArticleById, findOwnedArticle, findSlugByShortCode, getPublishedDetailBySlug, listMoreFromAuthor, toOwnedArticle } from "../queries/articles.js";
import { createFlag } from "../queries/flags.js";
import { storyPressMeet } from "../queries/press-meets.js";
import { ogImage, shareImage } from "../queries/share-image.js";
import { hasDisliked, recordRead, recordShare, setDislike, setLike, setSave, type Liker } from "../queries/social.js";
import {
  SHORT_CODE_REGEX,
  articleCategorySchema,
  commentSchema,
  flagSchema,
  saveArticleSchema,
  shareSchema,
  type ShortLinkTarget,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

export function articleRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  const socialLimit = rateLimit(limiter, "social", RATE_LIMITS.social, "user");

  // POST /api/articles — save draft / publish (full composer state). Reporters + Editor Desk only;
  // Trainee "publish" goes to the Review Desk.
  app.post("/", requireReporter, async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, saveArticleSchema);
    if (!input.id) {
      // "article create" budget: only new articles count, re-saving a draft doesn't.
      const hit = limiter.hit(`article-create|u:${viewer.id}`, RATE_LIMITS.articleCreate);
      if (!hit.allowed) {
        c.header("Retry-After", String(hit.retryAfterSec));
        throw new ApiError(429, "rate_limited", "You're creating stories too quickly. Try again later.");
      }
    }
    // The Editor Desk editing another reporter's story (owner 2026-10-31): saved as that author's, and logged.
    if (input.id && viewer.role === "admin") {
      const target = await findArticleById(input.id);
      if (target && target.authorId !== viewer.id) {
        const result = await saveArticle({ id: target.authorId, needsReview: false, editorId: viewer.id }, input);
        await writeAudit(db, { actorId: viewer.id, action: "story.edit", targetType: "article", targetId: target.id, targetLabel: input.title ?? target.title });
        return c.json(result, 200);
      }
    }
    const groupWriter = viewer.actor ? { id: viewer.actor.id, role: viewer.actor.role } : undefined;
    const result = await saveArticle({ id: viewer.id, needsReview: needsReview(viewer), groupWriter }, input);
    return c.json(result, input.id ? 200 : 201);
  });

  // GET /api/articles/by-slug/:slug — public article page data. Read-only: rendering (and link prefetching) must
  // never count as a "read"; the page posts /:id/read once it is actually open.
  app.get("/by-slug/:slug", async (c) => {
    const viewer = c.get("viewer");
    const detail = await getPublishedDetailBySlug(c.req.param("slug").toLowerCase(), viewer);
    if (!detail) throw notFound("Story not found");
    const [moreFromAuthor, disliked] = await Promise.all([
      listMoreFromAuthor(detail.author.id, detail.id, viewer?.id ?? null, 3),
      hasDisliked(viewerKeyOf(c), detail.id),
    ]);
    return c.json({ article: { ...detail, disliked }, moreFromAuthor });
  });

  // GET /api/articles/by-code/:code — a short share link (`/s/<code>`, frontend app/s/[code]/route.ts) → the slug of the
  // publicly visible story carrying that code. Case-insensitive; malformed or unknown codes and stories the public
  // can't see are all 404. Registered before the "/:id…" routes so none of them can shadow it.
  app.get("/by-code/:code", async (c) => {
    const code = c.req.param("code").toLowerCase();
    const slug = SHORT_CODE_REGEX.test(code) ? await findSlugByShortCode(code) : null;
    if (!slug) throw notFound("Story not found");
    return c.json({ slug } satisfies ShortLinkTarget);
  });

  // GET /api/articles/:id/share-image — the cover as a JPEG, attached when the story is shared (owner 2026-10-02).
  app.get("/:id/share-image", rateLimit(limiter, "share", RATE_LIMITS.share, "viewer"), async (c) => {
    const image = await shareImage(c.req.param("id"));
    if (!image) throw notFound("Story not found");
    return c.body(new Uint8Array(image), 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" });
  });

  // GET /api/articles/:id/og.jpg — the 1200×630 link-preview picture (og:image) for WhatsApp / Facebook / X. Public,
  // no rate limit: link crawlers fetch it.
  app.get("/:id/og.jpg", async (c) => {
    const image = await ogImage(c.req.param("id"), (c.req.query("v") ?? "").slice(0, 80));
    if (!image) throw notFound("Story not found");
    return c.body(new Uint8Array(image), 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
  });

  // POST /api/articles/:id/read — the article page was opened (Newsroom "reads", unique per viewer).
  app.post("/:id/read", rateLimit(limiter, "read", RATE_LIMITS.read, "viewer"), async (c) => {
    const viewer = c.get("viewer");
    const result = await recordRead(c.req.param("id"), ensureViewerKey(c, limiter), viewer?.id ?? null);
    if (!result) throw notFound("Story not found");
    return c.json(result);
  });

  // GET /api/articles/:id — owner only (composer / drafts). Others get 404.
  app.get("/:id", requireUser, async (c) => {
    const viewer = mustViewer(c);
    // The Editor Desk can open anyone's story in the composer (owner 2026-10-31).
    const row = viewer.role === "admin" ? await findArticleById(c.req.param("id")) : await findOwnedArticle(c.req.param("id"), viewer.id);
    if (!row) throw notFound("Story not found");
    const pressMeet = row.pressMeetId ? await storyPressMeet(row.pressMeetId, viewer.id, row.id) : null;
    return c.json({ article: { ...toOwnedArticle(row), pressMeet } });
  });

  // DELETE /api/articles/:id — owner only (any role: a former reporter can still remove their stories).
  app.delete("/:id", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const groupWriter = viewer.actor ? { id: viewer.actor.id, role: viewer.actor.role } : undefined;
    const deleted = await deleteArticle(viewer.id, c.req.param("id"), groupWriter);
    if (!deleted) throw notFound("Story not found");
    return c.body(null, 204);
  });

  // PATCH /api/articles/:id/category — the author (or the Editor Desk, audited) moves a story to another category.
  app.patch("/:id/category", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, articleCategorySchema);
    const result = await setArticleCategory(viewer, c.req.param("id"), input);
    if (!result) throw notFound("Story not found");
    return c.json(result);
  });

  // GET /api/articles/:id/comments?cursor=&limit= — public, newest first; 404 when the story isn't visible.
  app.get("/:id/comments", async (c) => {
    const viewer = c.get("viewer");
    const page = await listComments(c.req.param("id"), viewer ? { id: viewer.id, role: viewer.role } : null, c.req.query("cursor"), clampLimit(c.req.query("limit"), 20, 50));
    if (!page) throw notFound("Story not found");
    return c.json(page);
  });

  // GET /api/articles/:id/comments/:commentId/replies — the replies to one comment, oldest first.
  app.get("/:id/comments/:commentId/replies", async (c) => {
    const viewer = c.get("viewer");
    const items = await listReplies(c.req.param("id"), c.req.param("commentId"), viewer ? { id: viewer.id, role: viewer.role } : null);
    if (!items) throw notFound("Comment not found");
    return c.json({ items });
  });

  // POST /api/articles/:id/comments — onboarded accounts comment on a visible story (`parentId` = a reply).
  app.post("/:id/comments", requireOnboarded, rateLimit(limiter, "comment", RATE_LIMITS.comment, "user"), async (c) => {
    const viewer = mustViewer(c);
    const { body, gif, parentId } = await readJson(c, commentSchema);
    const added = await addComment(viewer, c.req.param("id"), body, parentId ?? null, gif ?? null);
    if (!added) throw notFound(parentId ? "Comment not found" : "Story not found");
    return c.json(added, 201);
  });

  // POST / DELETE /api/articles/:id/comments/:commentId/like
  for (const method of ["post", "delete"] as const) {
    app[method]("/:id/comments/:commentId/like", requireOnboarded, socialLimit, async (c) => {
      const viewer = mustViewer(c);
      const result = await setCommentLike(viewer.id, c.req.param("id"), c.req.param("commentId"), method === "post");
      if (!result) throw notFound("Comment not found");
      return c.json(result);
    });
  }

  // DELETE /api/articles/:id/comments/:commentId — the comment's author, the story's author or the Editor Desk.
  // → { commentCount }: the story's new count.
  app.delete("/:id/comments/:commentId", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const commentCount = await deleteComment(viewer, c.req.param("id"), c.req.param("commentId"));
    if (commentCount === null) throw notFound("Comment not found");
    return c.json({ commentCount });
  });

  // POST / DELETE /api/articles/:id/like — anyone can like (owner 2026-09-28). Accounts like as themselves (once
  // onboarded); logged-out visitors by their signed anonymous id (issued here if they have none yet), one like per
  // browser. Commenting, following and saving still need an account.
  for (const method of ["post", "delete"] as const) {
    app[method]("/:id/like", socialLimit, async (c) => {
      const viewer = c.get("viewer");
      let liker: Liker;
      if (viewer) {
        if (!viewer.onboarded) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
        liker = { kind: "user", id: viewer.id };
      } else {
        const key = ensureViewerKey(c, limiter);
        if (!key) throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.");
        liker = { kind: "anon", id: key.slice(2) };
      }
      // A like replaces this viewer's 👎 (owner 2026-10-16).
      if (method === "post") await setDislike(liker.kind === "user" ? `u:${liker.id}` : `a:${liker.id}`, c.req.param("id"), false);
      const result = await setLike(liker, c.req.param("id"), method === "post");
      if (!result) throw notFound("Story not found");
      return c.json(result);
    });
  }

  // POST / DELETE /api/articles/:id/dislike — 👎 inside the story (owner 2026-10-16); anyone, like likes. Disliking takes
  // the viewer's like back. → { disliked, dislikeCount, liked, likeCount }
  for (const method of ["post", "delete"] as const) {
    app[method]("/:id/dislike", socialLimit, async (c) => {
      const viewer = c.get("viewer");
      if (viewer && !viewer.onboarded) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
      const key = viewer ? `u:${viewer.id}` : ensureViewerKey(c, limiter);
      if (!key) throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.");
      const liker: Liker = viewer ? { kind: "user", id: viewer.id } : { kind: "anon", id: key.slice(2) };
      const id = c.req.param("id");
      const like = method === "post" ? await setLike(liker, id, false) : null;
      const result = await setDislike(key, id, method === "post");
      if (!result) throw notFound("Story not found");
      return c.json({ ...result, liked: like ? like.liked : null, likeCount: like ? like.likeCount : null });
    });
  }

  // POST / DELETE /api/articles/:id/save — "Save for later" (every onboarded account).
  for (const method of ["post", "delete"] as const) {
    app[method]("/:id/save", requireOnboarded, socialLimit, async (c) => {
      const viewer = mustViewer(c);
      const articleId = c.req.param("id");
      const result = await setSave(viewer.id, articleId, method === "post");
      if (!result) throw notFound("Story not found");
      return c.json({ ...result, articleId });
    });
  }

  // POST /api/articles/:id/flag { reason, note? } — one open flag per reader per story.
  app.post("/:id/flag", requireOnboarded, rateLimit(limiter, "flag", RATE_LIMITS.flag, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, flagSchema);
    await createFlag(viewer.id, c.req.param("id"), input);
    return c.json({ flagged: true }, 201);
  });

  // POST /api/articles/:id/share { channel } — anyone may share; counted once per viewer per story per 24 h.
  app.post("/:id/share", rateLimit(limiter, "share", RATE_LIMITS.share, "viewer"), async (c) => {
    const { channel } = await readJson(c, shareSchema);
    const result = await recordShare(c.req.param("id"), channel, ensureViewerKey(c, limiter));
    if (!result) throw notFound("Story not found");
    return c.json({ shareCount: result.shareCount });
  });

  return app;
}
