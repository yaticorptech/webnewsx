import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { article, wish } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { publishDueStories } from "../lib/scheduled-publish-worker.js";
import { mustViewer, requireUser } from "../middleware/guards.js";
import { deleteWish } from "../queries/wishes.js";
import { isUuid } from "../queries/shared.js";
import type { ScheduledItem, WishKind } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/**
 * /api/scheduled (owner 2026-11-06: "show scheduled articles list also in post article page"): the viewer's stories and
 * birthday wishes / invitations waiting for their time, soonest first — with Publish now and Cancel.
 */
export function scheduledRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const [stories, wishes] = await Promise.all([
      db
        .select({ id: article.id, title: article.title, imageUrl: article.coverUrl, at: article.scheduledAt })
        .from(article)
        .where(and(eq(article.authorId, viewer.id), eq(article.status, "draft"), isNotNull(article.scheduledAt)))
        .orderBy(asc(article.scheduledAt))
        .limit(100),
      db
        .select({ id: wish.id, kind: wish.kind, title: wish.title, imageUrl: wish.photoUrl, at: wish.scheduledAt })
        .from(wish)
        .where(and(eq(wish.authorId, viewer.id), isNotNull(wish.scheduledAt)))
        .orderBy(asc(wish.scheduledAt))
        .limit(100),
    ]);
    const items: ScheduledItem[] = [
      ...stories.map((s) => ({ type: "article" as const, id: s.id, title: s.title ?? "Untitled story", imageUrl: s.imageUrl, scheduledAt: (s.at ?? new Date()).toISOString() })),
      ...wishes.map((w) => ({ type: w.kind as WishKind, id: w.id, title: w.title, imageUrl: w.imageUrl, scheduledAt: (w.at ?? new Date()).toISOString() })),
    ].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return c.json({ items });
  });

  // POST /api/scheduled/:type/:id/now — goes live straight away (the same path as when its time comes).
  app.post("/:type/:id/now", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const id = c.req.param("id");
    if (!isUuid(id)) throw notFound("Scheduled post not found");
    const now = new Date();
    const moved =
      c.req.param("type") === "article"
        ? await db
            .update(article)
            .set({ scheduledAt: now })
            .where(and(eq(article.id, id), eq(article.authorId, viewer.id), eq(article.status, "draft"), isNotNull(article.scheduledAt)))
            .returning({ id: article.id })
        : await db
            .update(wish)
            .set({ scheduledAt: now })
            .where(and(eq(wish.id, id), eq(wish.authorId, viewer.id), isNotNull(wish.scheduledAt)))
            .returning({ id: wish.id });
    if (moved.length === 0) throw notFound("Scheduled post not found");
    await publishDueStories();
    return c.json({ ok: true });
  });

  // DELETE /api/scheduled/:type/:id — a story goes back to Drafts; a wish (never shown) is removed.
  app.delete("/:type/:id", requireUser, async (c) => {
    const viewer = mustViewer(c);
    const id = c.req.param("id");
    if (!isUuid(id)) throw notFound("Scheduled post not found");
    if (c.req.param("type") === "article") {
      const off = await db
        .update(article)
        .set({ scheduledAt: null })
        .where(and(eq(article.id, id), eq(article.authorId, viewer.id), eq(article.status, "draft"), isNotNull(article.scheduledAt)))
        .returning({ id: article.id });
      if (off.length === 0) throw notFound("Scheduled post not found");
    } else {
      const [own] = await db
        .select({ id: wish.id })
        .from(wish)
        .where(and(eq(wish.id, id), eq(wish.authorId, viewer.id), isNotNull(wish.scheduledAt)))
        .limit(1);
      if (!own || !(await deleteWish({ id: viewer.id, role: viewer.role }, id))) throw notFound("Scheduled post not found");
    }
    return c.body(null, 204);
  });

  return app;
}
