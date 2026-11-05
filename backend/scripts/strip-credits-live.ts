/**
 * Owner 2026-11-05: "remove all source and author name from articles" — and for licensed photos "create one and add it,
 * remove old from R2". Drops every credit / source paragraph (<p><em>Source: … / Photo: … / ಚಿತ್ರ: … / ಮೂಲ: … /
 * Image: … / … Wikimedia Commons …</em></p>). A story whose photo needed that credit (Creative Commons BY / BY-SA, or a
 * Wikimedia photo of unknown licence) gets a WebNEWSX-made cover instead, and its old files are deleted from storage
 * (only when no other story uses them). Public-domain, CC0, GODL-India and PIB photos stay. Dry run unless `--apply`.
 */
import { and, eq, ne, or } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { article } from "../src/db/schema.js";
import { htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { deleteQuietly, newImageKey, storage } from "../src/lib/storage.js";
import { makeCover } from "./made-cover.js";

const APPLY = process.argv.includes("--apply");
const CREDIT_P = /<p>\s*<em>((?:(?!<\/?p>).)*?)<\/em>\s*<\/p>/gis;
const IS_CREDIT = /^\s*(Source|Sources|Photo|Photos|Image|Images|Credit|ಚಿತ್ರ|ಮೂಲ)\s*:|Wikimedia Commons/i;
const FREE = /public domain|CC0|GODL|PIB\b|WebNEWSX/i;

async function stillUsed(key: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: article.id })
    .from(article)
    .where(and(ne(article.id, id), or(eq(article.coverKey, key), eq(article.articleImageKey, key))))
    .limit(1);
  return Boolean(row);
}

const rows = await db
  .select({ id: article.id, title: article.title, language: article.language, category: article.category, authorId: article.authorId, bodyHtml: article.bodyHtml, coverKey: article.coverKey, articleImageKey: article.articleImageKey, videoUrl: article.videoUrl })
  .from(article);

let stripped = 0;
let swapped = 0;
try {
  for (const row of rows) {
    if (!row.bodyHtml) continue;
    const credits: string[] = [];
    const bodyHtml = row.bodyHtml.replace(CREDIT_P, (whole, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "");
      if (!IS_CREDIT.test(text)) return whole;
      credits.push(text);
      return "";
    });
    if (credits.length === 0) continue;
    const all = credits.join(" ");
    const licensed = !row.videoUrl && (/\bCC BY/i.test(all) || (/Wikimedia/i.test(all) && !FREE.test(all)));
    stripped++;
    if (licensed) swapped++;
    console.log(`${licensed ? "SWAP " : "strip"} ${row.title?.slice(0, 70)}  ← ${all.slice(0, 90)}`);
    if (!APPLY) continue;

    const bodyText = htmlToText(bodyHtml);
    const update: Partial<typeof article.$inferInsert> = {
      bodyHtml,
      bodyText,
      excerpt: makeExcerpt(htmlToExcerptText(bodyHtml)),
      readingMinutes: readingMinutes(bodyText),
    };
    const oldKeys = [row.coverKey, row.articleImageKey].filter((k): k is string => Boolean(k));
    if (licensed) {
      const source = await makeCover({ title: row.title ?? "", language: row.language ?? "en", category: row.category ?? "others" });
      const cover = await processImage(source, "cover");
      const image = await processImage(source, "article");
      const coverKey = newImageKey("cover", row.authorId);
      const articleImageKey = newImageKey("cover", row.authorId);
      Object.assign(update, {
        coverUrl: await storage.put(coverKey, cover.buffer, cover.contentType),
        coverKey,
        coverWidth: cover.width,
        coverHeight: cover.height,
        coverBlur: cover.blurDataUrl,
        articleImageUrl: await storage.put(articleImageKey, image.buffer, image.contentType),
        articleImageKey,
        articleImageWidth: image.width,
        articleImageHeight: image.height,
        articleImageBlur: image.blurDataUrl,
        posterX: null,
        posterY: null,
        posterZoom: null,
      });
    }
    await db.update(article).set(update).where(eq(article.id, row.id));
    if (licensed) for (const key of oldKeys) if (!(await stillUsed(key, row.id))) await deleteQuietly(key);
  }
  console.log(`${stripped} stories with credits, ${swapped} photos replaced${APPLY ? "" : " — dry run (add --apply)"}`);
} catch (error) {
  console.error("[strip-credits-live] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
