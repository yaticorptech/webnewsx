import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, user } from "../db/schema.js";
import type { Headline } from "../shared/contracts.js";
import { visibleWhere } from "./articles.js";
import { toReporterLevel } from "../lib/roles.js";
import { badgeLevelSql, descNullsLast } from "./shared.js";

/** Latest published headlines for the ticker and the Live Wire rail. */
export async function listHeadlines(limit: number): Promise<Headline[]> {
  const rows = await db
    .select({
      id: article.id,
      slug: article.slug,
      title: article.title,
      publishedAt: article.publishedAt,
      username: user.username,
      reporterLevel: badgeLevelSql,
    })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(visibleWhere())
    .orderBy(descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    author: { username: row.username ?? "", reporterLevel: toReporterLevel(row.reporterLevel) },
  }));
}
