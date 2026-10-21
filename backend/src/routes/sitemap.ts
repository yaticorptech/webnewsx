import { and, desc, eq, isNotNull, isNull, max, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { article, user } from "../db/schema.js";
import { visibleWhere } from "../queries/articles.js";
import type { SitemapData } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/** The sitemap protocol allows 50,000 URLs per file; the newest stories matter most. */
const MAX_ARTICLES = 45_000;
const MAX_PUBLISHERS = 5_000;

export function sitemapRoutes() {
  const app = new Hono<AppEnv>();

  // GET /api/sitemap — public stories (newest first) and publishers with at least one public story (SEO).
  app.get("/", async (c) => {
    const [articles, publishers] = await Promise.all([
      db
        .select({ slug: article.slug, title: article.title, publishedAt: article.publishedAt, updatedAt: article.updatedAt, coverUrl: article.coverUrl })
        .from(article)
        .innerJoin(user, eq(user.id, article.authorId))
        .where(and(visibleWhere(), isNotNull(article.slug)))
        .orderBy(desc(article.publishedAt))
        .limit(MAX_ARTICLES),
      db
        .select({ username: user.username, updatedAt: max(article.publishedAt) })
        .from(user)
        .innerJoin(article, eq(article.authorId, user.id))
        .where(and(visibleWhere(), isNotNull(user.username), isNull(user.suspendedAt)))
        .groupBy(user.id, user.username)
        .orderBy(sql`max(${article.publishedAt}) desc`)
        .limit(MAX_PUBLISHERS),
    ]);
    const body: SitemapData = {
      articles: articles.map((a) => ({
        slug: a.slug as string,
        title: a.title ?? "",
        publishedAt: (a.publishedAt ?? a.updatedAt).toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        coverUrl: a.coverUrl,
      })),
      publishers: publishers.map((p) => ({ username: p.username as string, updatedAt: new Date(p.updatedAt ?? Date.now()).toISOString() })),
    };
    c.header("Cache-Control", "public, max-age=300");
    return c.json(body);
  });

  return app;
}
