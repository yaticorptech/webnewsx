/**
 * Openly licensed news for local development (owner 2026-10-05: "add open-sourced articles"): the latest India stories
 * from Global Voices (globalvoices.org — the whole site is Creative Commons Attribution 3.0), each with a photo that is
 * openly licensed itself (its caption names a CC / public-domain licence; others are never copied). Each becomes a story
 * by a demo reporter who files in English (@demo.webnews.local — never real accounts), with the text as published, the
 * photo's own credit, and the attribution CC BY asks for: the original author, a link to the original and the licence.
 * Idempotent: a story already imported (same title) is skipped. Local development only.
 *
 *   node --import tsx scripts/seed-global-voices.ts
 */
import { and, eq, isNotNull, isNull, like, notInArray } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { DEMO_EMAIL_DOMAIN } from "../src/db/purge.js";
import { article, pressPass, user } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { sanitizeArticleHtml } from "../src/lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import { LIMITS, POSTER_TEMPLATE_VALUES, type Category, type PressLanguage } from "../src/shared/contracts.js";
import { DEMO_PUBLISHERS } from "./seed-data.js";
import { DEMO_TRAINEE } from "./seed-roles-data.js";

/*
 * Owner 2026-10-10 ("more multi-language articles, every category, all reporters"): --site=https://hi.globalvoices.org
 * --language=hi for Global Voices in Hindi (same CC BY licence), --feed=<path> for another topic's feed (default: India),
 * --category=<section> when the headline names none, --all-reporters to have every Verified reporter file them.
 */
const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const GV = option("site") ?? "https://globalvoices.org";
const FEED = `${GV}${option("feed") ?? "/-/world/south-asia/india/feed/"}`;
const LANGUAGE = (option("language") ?? "en") as PressLanguage;
const FALLBACK = (option("category") ?? "national") as Category;
const ALL_REPORTERS = process.argv.includes("--all-reporters");
const HEADERS = { "User-Agent": "Mozilla/5.0 (WebNEWS local dev seed)" };
const PAUSE_MS = 1500;
/** A caption that names one of these is an openly licensed photo. */
const OPEN_LICENCE = /\bCC[ -]?(BY|0)\b|Creative Commons|public domain|Pixabay|Unsplash|Pexels|क्रिएटिव कॉमन्स|सार्वजनिक डोमेन/i;

type Post = {
  title: { rendered: string };
  content: { rendered: string };
  date_gmt: string;
  link: string;
  _embedded?: { "wp:featuredmedia"?: { source_url?: string; caption?: { rendered: string } }[] };
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…",
};
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
const plain = (html: string) => decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sections by the headline; National otherwise. */
const CATEGORY_HINTS: [RegExp, Category][] = [
  [/arrest|police|murder|crime|jail|prison|गिरफ्तार|पुलिस|हत्या|जेल/i, "crime"],
  [/cricket|football|olympic|sport|athlete|क्रिकेट|खेल|फुटबॉल/i, "sports"],
  [/\bfilm|cinema|movie|bollywood|फिल्म|सिनेमा/i, "cinema"],
  [/school|universit|student|education|शिक्षा|स्कूल|छात्र/i, "education"],
  [/\bAI\b|artificial intelligence|internet|digital|tech|app\b|online|इंटरनेट|डिजिटल|तकनीक/i, "technology"],
  [/econom|business|market|trade|price|worker|अर्थव्यवस्था|व्यापार|बाजार/i, "business"],
  [/\bjobs?\b|employment|unemploy|रोजगार|नौकरी/i, "jobs"],
  [/election|protest|citizenship|parliament|government|authoritarian|law|court|चुनाव|सरकार|संसद|विरोध/i, "politics"],
  [/climate|wildlife|pangolin|forest|river|species|environment|जलवायु|जंगल|पर्यावरण/i, "others"],
  [/music|festival|art|culture|language|संगीत|त्योहार|कला|संस्कृति/i, "entertainment"],
  [/Karnataka|Bengaluru|Bangalore|कर्नाटक|बेंगलुरु/i, "karnataka"],
];
const categoryOf = (title: string): Category => CATEGORY_HINTS.find(([hint]) => hint.test(title))?.[1] ?? FALLBACK;

function headline(title: string): string {
  if (title.length <= LIMITS.titleMax) return title;
  const cut = title.slice(0, LIMITS.titleMax - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), LIMITS.titleMax - 20)).trimEnd()}…`;
}

async function fetchOk(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) return null;
    } catch {
      // Retried below.
    }
    await pause(2000 * (attempt + 1));
  }
  return null;
}

/** The feed's posts: WordPress id + author (the API doesn't name authors). */
async function feedPosts(): Promise<{ id: number; author: string }[]> {
  const feed = await (await fetchOk(FEED))?.text();
  if (!feed) throw new Error("Couldn't read the Global Voices feed");
  return [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item = ""]) => {
    const id = Number(/[?&]p=(\d+)/.exec(item)?.[1]);
    const author = plain(/<dc:creator>([\s\S]*?)<\/dc:creator>/.exec(item)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "") ?? "");
    return Number.isInteger(id) && id > 0 ? [{ id, author: author || "Global Voices" }] : [];
  });
}

/**
 * The story's paragraphs (headings kept), leaving out photo captions and embeds. Blockquotes become plain paragraphs.
 */
function paragraphsOf(content: string): string[] {
  const body = content
    .replace(/<div[^>]*class="[^"]*wp-caption[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<(script|iframe|style)[\s\S]*?<\/\1>/gi, "");
  const blocks: string[] = [];
  for (const [, tag, inner] of body.matchAll(/<(p|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = plain(inner ?? "");
    if (text.length > 1) blocks.push(tag?.toLowerCase() === "p" ? `<p>${escape(text)}</p>` : `<h3>${escape(text)}</h3>`);
  }
  return blocks;
}

/** An openly licensed photo: the featured one, else the first in the story, with its caption (credit + licence). */
function openPhoto(post: Post): { url: string; credit: string } | null {
  const featured = post._embedded?.["wp:featuredmedia"]?.[0];
  const caption = plain(featured?.caption?.rendered ?? "");
  if (featured?.source_url && OPEN_LICENCE.test(caption)) return { url: featured.source_url, credit: caption };
  for (const [block = ""] of post.content.rendered.matchAll(/<div[^>]*class="[^"]*wp-caption[^"]*"[^>]*>[\s\S]*?<\/div>/gi)) {
    const text = plain(/class="wp-caption-text"[^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "");
    const src = /<img[^>]+src="([^"]+)"/.exec(block)?.[1];
    if (src && OPEN_LICENCE.test(text)) return { url: src, credit: text };
  }
  return null;
}

async function main() {
  if (env.isProduction || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.FRONTEND_URL)) {
    throw new Error("Demo news is for local development only");
  }
  const desks = [...DEMO_PUBLISHERS.map((p) => p.username), DEMO_TRAINEE.username];
  const reporters = await db
    .select({ id: user.id, languages: pressPass.languages })
    .from(user)
    .innerJoin(pressPass, eq(pressPass.userId, user.id))
    .where(
      ALL_REPORTERS
        ? and(eq(pressPass.level, "verified"), isNull(pressPass.revokedAt), isNotNull(user.username))
        : and(like(user.email, `%@${DEMO_EMAIL_DOMAIN}`), notInArray(user.username, desks)),
    );
  // Reporters who file in the stories' language (named `english` from when it was English only).
  const english = reporters.filter((r) => r.languages.includes(LANGUAGE));
  if (english.length === 0) throw new Error(`No reporters filing in ${LANGUAGE} found`);

  const posts = await feedPosts();
  console.log(`[seed-global-voices] ${posts.length} stories in ${FEED}…`);
  let created = 0;
  let skipped = 0;
  let noPhoto = 0;
  for (const [index, { id, author: writer }] of posts.entries()) {
    await pause(PAUSE_MS);
    const post = (await (await fetchOk(`${GV}/wp-json/wp/v2/posts/${id}?_embed=wp:featuredmedia`))?.json()) as Post | undefined;
    if (!post) continue;
    const title = headline(plain(post.title.rendered));
    const [existing] = await db.select({ id: article.id }).from(article).where(eq(article.title, title)).limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    const photo = openPhoto(post);
    const blocks = paragraphsOf(post.content.rendered);
    if (!photo || blocks.length === 0) {
      noPhoto++;
      continue;
    }
    const image = await fetchOk(photo.url);
    const cover = image ? await processImage(Buffer.from(await image.arrayBuffer()), "cover").catch(() => null) : null;
    if (!cover) {
      noPhoto++;
      continue;
    }
    const reporter = english[index % english.length] as (typeof english)[number];
    const coverKey = newImageKey("cover", reporter.id);
    const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
    const bodyHtml = sanitizeArticleHtml(
      blocks.join("") +
        `<p><em>Photo: ${escape(photo.credit)}</em></p>` +
        `<p><em>Written by ${escape(writer)} and first published by <a href="${escape(post.link)}">Global Voices</a> under a Creative Commons Attribution 3.0 licence.</em></p>`,
    );
    const bodyText = htmlToText(bodyHtml);
    const publishedAt = new Date(`${post.date_gmt}Z`);
    const values = {
      authorId: reporter.id,
      status: "published" as const,
      title,
      bodyHtml,
      bodyText,
      excerpt: makeExcerpt(htmlToExcerptText(bodyHtml)),
      readingMinutes: readingMinutes(bodyText),
      coverUrl,
      coverKey,
      coverWidth: cover.width,
      coverHeight: cover.height,
      coverBlur: cover.blurDataUrl,
      category: categoryOf(title),
      language: LANGUAGE,
      template: POSTER_TEMPLATE_VALUES[index % POSTER_TEMPLATE_VALUES.length],
      createdAt: publishedAt,
      updatedAt: publishedAt,
      publishedAt,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        await db.insert(article).values({ ...values, slug: makeSlug(title), shortCode: makeShortCode() });
        created++;
        break;
      } catch (error) {
        if (attempt < 3 && isLinkCollision(error)) continue;
        throw error;
      }
    }
  }
  console.log(`[seed-global-voices] ${created} new stories, ${skipped} already there, ${noPhoto} left out (no openly licensed photo)`);
}

try {
  await main();
} catch (error) {
  console.error("[seed-global-voices] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
