/**
 * Today's news for local development (owner 2026-10-05: "fetch today's breaking news and its images from open-sourced
 * articles, under demo reporters"): the day's Press Information Bureau releases (pib.gov.in — Government of India press
 * releases, issued for the media to reproduce accurately with the source acknowledged) that come with a photo — each in
 * every language PIB issued it in (owner: "the same article in multiple languages, with its image"), all versions with
 * that release's photo. Each version becomes a story by a demo reporter who files in its language (@demo.webnews.local —
 * never real accounts), with its text as issued and a "Source: PIB" line linking to it. Idempotent: a version already
 * imported (same title) is skipped. Local development only.
 *
 *   node --import tsx scripts/seed-pib-news.ts [YYYY-MM-DD] [--prids=2319132,2319089,…] [--languages=en,hi,kn] [--one-version] [--all-reporters]
 *   (default: today in India; --prids reads just those releases instead of walking back from the newest)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const PIB = "https://pib.gov.in";
const HEADERS = { "User-Agent": "Mozilla/5.0 (WebNEWS local dev seed)" };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/**
 * Releases are numbered in order (regional-language ones trail a little): the walk starts a bit past the newest number
 * in PIB's feed and goes back until it has seen OLDER_STREAK releases in a row from before the day (or SCAN_MAX).
 * Gently — PIB's firewall shuts out a burst of requests for a while — and each page is kept in CACHE for re-runs.
 */
const SCAN_AHEAD = 60;
const SCAN_MAX = 600;
const OLDER_STREAK = 40;
const BATCH = 1;
const BATCH_PAUSE_MS = 2500;
const CACHE = join(tmpdir(), "webnews-pib-cache");
const MIN_PHOTO_WIDTH = 400;
/**
 * Icons, not photos (owner 2026-10-07: a release's YouTube "follow us" icon became stories' covers): PIB offices put
 * social / contact icons under some releases — big files shown at ~20 px. An image shown smaller than MIN_SHOWN_PX, or
 * named like one of those icons, is never a story's photo; nor is anything after the "***" that closes a release.
 */
const MIN_SHOWN_PX = 120;
const ICON_NAME = /^(?:yt|youtube|twitter|x-?logo|fb|facebook|insta(?:gram)?|e-?mail|mail|sharechat|whatsapp|koo|linkedin|telegram|threads|icon|logo)/i;

type Release = {
  prid: number;
  title: string;
  ministry: string;
  publishedAt: Date;
  paragraphs: string[];
  photos: string[];
  language: PressLanguage;
  /** The same release in PIB's other languages (the page's "Read this release in" links). */
  translations: { prid: number; language: PressLanguage | null }[];
};

/** PIB's names for its languages → ours ("Manipuri" for "Manipuri (Meitei)"); null for ones we don't carry. */
const PIB_LANGUAGES: Record<string, PressLanguage> = {
  english: "en", hindi: "hi", urdu: "ur", marathi: "mr", gujarati: "gu", tamil: "ta", telugu: "te", kannada: "kn",
  malayalam: "ml", bengali: "bn", assamese: "as", punjabi: "pa", odia: "or", oriya: "or", manipuri: "mni", konkani: "kok",
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", rupee: "₹", zwj: "‍", zwnj: "‌",
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

/** "05 OCT 2026 2:43PM by PIB Delhi" (India time) → a Date. */
function releaseTime(line: string): Date | null {
  const m = /(\d{1,2}) ([A-Z]{3}) (\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(line);
  if (!m) return null;
  const [, date, mon = "", year, hours, minutes, half = ""] = m;
  let hour = Number(hours) % 12;
  if (half.toUpperCase() === "PM") hour += 12;
  return new Date(Date.UTC(Number(year), MONTHS.indexOf(mon.toUpperCase()), Number(date), hour, Number(minutes)) - 330 * 60_000);
}

/** Indian scripts → language; the danda (।), which every North Indian script borrows, isn't counted. */
const SCRIPTS: [RegExp, PressLanguage][] = [
  [/[ऀ-ॣ०-ॿ]/g, "hi"],
  [/[ঀ-৿]/g, "bn"],
  [/[਀-੿]/g, "pa"],
  [/[઀-૿]/g, "gu"],
  [/[଀-୿]/g, "or"],
  [/[஀-௿]/g, "ta"],
  [/[ఀ-౿]/g, "te"],
  [/[ಀ-೿]/g, "kn"],
  [/[ഀ-ൿ]/g, "ml"],
  [/[ꯀ-꯿]/g, "mni"],
  [/[؀-ۿ]/g, "ur"],
];

/**
 * The script with the most letters (English when there are none); Bengali script with ৰ/ৱ is Assamese, Devanagari
 * with Marathi's common words is Marathi.
 */
function languageOf(text: string): PressLanguage {
  let language: PressLanguage = "en";
  let most = 0;
  for (const [script, code] of SCRIPTS) {
    const count = text.match(script)?.length ?? 0;
    if (count > most) [language, most] = [code, count];
  }
  if (language === "bn" && /[ৰৱ]/.test(text)) return "as";
  if (language === "hi") {
    const marathi = text.match(/(^|\s)(आणि|आहे|आहेत|असे|झाले|केले|यांनी|च्या)(?=\s|$)/g)?.length ?? 0;
    const hindi = text.match(/(^|\s)(और|है|हैं|के|की|ने|किया)(?=\s|$)/g)?.length ?? 0;
    if (marathi > hindi) return "mr";
  }
  return language;
}

/** Sections by the issuing ministry (in any language PIB uses) or the headline; National otherwise. */
const CATEGORY_HINTS: [RegExp, Category][] = [
  // Owner 2026-10-10: every section that PIB's releases can honestly fill.
  [/Karnataka|Bengaluru|Bangalore|Mysuru|Mangaluru|ಕರ್ನಾಟಕ|ಬೆಂಗಳೂರು|कर्नाटक|बेंगलुरु/i, "karnataka"],
  [/Employment|Recruitment|Rozgar|Vacanc|Staff Selection|UPSC|Labour|रोजगार|भर्ती|ಉದ್ಯೋಗ|ನೇಮಕಾತಿ/i, "jobs"],
  [/\bFilm|Cinema|IFFI|NFDC|फिल्म|सिनेमा|ಚಲನಚಿತ್ರ|ಸಿನಿಮಾ/i, "cinema"],
  [/External Affairs|bilateral|Ambassador|Embassy|विदेश मंत्रालय|ವಿದೇಶಾಂಗ/i, "world"],
  [/Prime Minister's Office|President's Secretariat|Vice President|Parliament|Election Commission|Cabinet|प्रधानमंत्री कार्यालय|राष्ट्रपति|ಪ್ರಧಾನಮಂತ್ರಿ|ರಾಷ್ಟ್ರಪತಿ/i, "politics"],
  [/seiz|arrest|smuggl|जब्त|गिरफ्तार|ضبط|ગિરફ્તાર|જપ્ત/i, "crime"],
  [/Youth Affairs|Sports|Asian Games|खेल|क्रीड़ा|ક્રીડા|ખેલ|کھیل|ਖੇਡ/i, "sports"],
  [/Science|Atomic|Electronics|Space|Communications|Earth Sciences|विज्ञान|अणु|परमाणु|प्रौद्योगिकी|પરમાણુ|વિજ્ઞાન|સંચાર|سائنس|ایٹمی|পাৰমাণৱিক|পারমাণবিক|বিজ্ঞান|ਪ੍ਰਮਾਣੂ|ਵਿਗਿਆਨ/i, "technology"],
  [/Education|शिक्षा|શિક્ષણ|تعلیم|শিক্ষা|ਸਿੱਖਿਆ/i, "education"],
  [/Finance|Commerce|Textiles|Corporate|Agriculture|Fisheries|Ports|Shipping|MSME|वित्त|वाणिज्य|कृषि|वस्त्र|નાણા|કૃષિ|વાણિજ્ય|مالیات|زراعت|ਖੇਤੀਬਾੜੀ/i, "business"],
  [/Information & Broadcasting|सूचना और प्रसारण|માહિતી અને પ્રસારણ|اطلاعات و نشریات/i, "entertainment"],
];
function categoryOf(release: Release): Category {
  for (const [hint, category] of CATEGORY_HINTS) if (hint.test(release.ministry) || hint.test(release.title)) return category;
  return "national";
}

/** Headlines over the limit are cut at a word, with an ellipsis. */
function headline(title: string): string {
  if (title.length <= LIMITS.titleMax) return title;
  const cut = title.slice(0, LIMITS.titleMax - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), LIMITS.titleMax - 20)).trimEnd()}…`;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.text();
      if (response.status === 403) throw new Error("PIB's firewall is refusing requests from this network for now — try again later");
      if (response.status < 500 && response.status !== 429) return null;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PIB's firewall")) throw error;
    }
    await pause(2000 * (attempt + 1));
  }
  return null;
}

/** A release page, from the cache when this machine has read it before. */
async function releasePage(prid: number): Promise<string | null> {
  const file = join(CACHE, `${prid}.html`);
  const cached = await readFile(file, "utf8").catch(() => null);
  if (cached) return cached;
  const page = await fetchText(`${PIB}/PressReleasePage.aspx?PRID=${prid}`);
  if (page?.includes('id="Titleh2"')) await writeFile(file, page);
  return page;
}

/** The release's photos: its images shown at a real size (icons left out — see MIN_SHOWN_PX). */
function releasePhotos(content: string): string[] {
  const photos = new Set<string>();
  for (const [tag] of content.matchAll(/<img\b[^>]*>/gi)) {
    const src = /src=["'](https?:\/\/static\.pib\.gov\.in\/WriteReadData\/userfiles\/image\/[^"'\s>]+\.(?:jpe?g|png))/i.exec(tag)?.[1];
    if (!src || ICON_NAME.test(src.split("/").pop() ?? "")) continue;
    // width / height attributes or styles in px (not max-width, not percentages).
    const shown = [...tag.matchAll(/(?<![-\w])(?:width|height)\s*[:=]\s*["']?\s*(\d+(?:\.\d+)?)\s*(px|%|em|rem|vw)?/gi)]
      .filter(([, , unit]) => !unit || unit.toLowerCase() === "px")
      .map(([, size]) => Number(size));
    if (shown.some((size) => size > 0 && size < MIN_SHOWN_PX)) continue;
    photos.add(src.replace(/^http:/i, "https:"));
  }
  return [...photos];
}

/** One release page → its parts, or null (no such release / not a release). */
async function readRelease(prid: number): Promise<Release | null> {
  const page = await releasePage(prid);
  const title = page && /<h1 id="Titleh2">([\s\S]*?)<\/h1>/.exec(page)?.[1];
  if (!page || !title) return null;
  const when = /id="PrDateTime"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1];
  const publishedAt = when ? releaseTime(plain(when)) : null;
  if (!publishedAt) return null;
  // The text runs from the date line to the "***" that closes every release (embedded posts left out).
  const start = page.indexOf('id="PrDateTime"');
  let end = page.indexOf('id="ReleaseId"', start);
  if (end < 0) end = page.length;
  const body = page.slice(start, end).replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  const paragraphs: string[] = [];
  for (const [, inner] of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = plain(inner ?? "");
    if (/^\*{3,}/.test(text)) break;
    if (text.length > 1) paragraphs.push(text);
  }
  const close = body.search(/\*{3,}/);
  const photos = releasePhotos(close >= 0 ? body.slice(0, close) : body);
  const clean = plain(title);
  const links = /class="ReleaseLang"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1] ?? "";
  const translations = [...links.matchAll(/PRID=(\d+)['"][^>]*>([^<]+)</g)].map(([, id, name]) => ({
    prid: Number(id),
    language: PIB_LANGUAGES[(name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? ""] ?? null,
  }));
  return {
    prid,
    title: clean,
    ministry: plain(/id="MinistryName"[^>]*>([\s\S]*?)<\/div>/.exec(page)?.[1] ?? ""),
    publishedAt,
    paragraphs,
    photos,
    language: languageOf(`${clean} ${paragraphs.slice(0, 3).join(" ")}`),
    translations,
  };
}

/**
 * Each photo release with all its translations (fetched gently; ones already read are reused). The language PIB names
 * a translation by wins over the script guess (Marathi vs Hindi, Assamese vs Bengali); ones we don't carry are left out.
 */
async function withTranslations(releases: Release[]): Promise<Release[][]> {
  const known = new Map(releases.map((r) => [r.prid, r]));
  const taken = new Set<number>();
  const groups: Release[][] = [];
  for (const lead of releases) {
    if (taken.has(lead.prid)) continue;
    taken.add(lead.prid);
    const group = [lead];
    for (const { prid, language } of lead.translations) {
      if (taken.has(prid) || !language) continue;
      taken.add(prid);
      let version = known.get(prid);
      if (!version) {
        version = (await readRelease(prid)) ?? undefined;
        await pause(BATCH_PAUSE_MS);
      }
      if (version && version.paragraphs.length > 0) group.push({ ...version, language });
    }
    groups.push(group);
  }
  return groups;
}

/** The newest release number in PIB's feed (the day's releases sit just behind it). */
async function newestRelease(): Promise<number> {
  const feed = await fetchText(`${PIB}/RssMain.aspx?ModId=6&Lang=1&Regid=3`);
  const newest = Math.max(...[...(feed ?? "").matchAll(/PRID=(\d+)/g)].map((m) => Number(m[1])));
  if (!Number.isFinite(newest)) throw new Error("Couldn't read PIB's feed");
  return newest;
}

/** Just the releases asked for (still only the day's), one at a time. */
async function listedReleases(day: string, prids: number[]): Promise<Release[]> {
  await mkdir(CACHE, { recursive: true });
  console.log(`[seed-pib-news] reading ${prids.length} PIB releases for ${day}…`);
  const found: Release[] = [];
  for (const prid of prids) {
    const release = await readRelease(prid);
    if (release && indiaDay(release.publishedAt) === day) found.push(release);
    await pause(BATCH_PAUSE_MS);
  }
  return found;
}

const indiaDay = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** The day's releases: newest number first, BATCH at a time, back until the releases are all from earlier days. */
async function releasesOf(day: string, newest: number): Promise<Release[]> {
  await mkdir(CACHE, { recursive: true });
  console.log(`[seed-pib-news] reading PIB releases for ${day} (newest: ${newest})…`);
  const found: Release[] = [];
  let older = 0;
  for (let prid = newest + SCAN_AHEAD; prid > newest + SCAN_AHEAD - SCAN_MAX && older < OLDER_STREAK; prid -= BATCH) {
    const batch = Array.from({ length: BATCH }, (_, i) => prid - i);
    for (const release of await Promise.all(batch.map(readRelease))) {
      if (!release) continue;
      const released = indiaDay(release.publishedAt);
      if (released === day) {
        found.push(release);
        older = 0;
      } else if (released < day) {
        older++;
      }
    }
    await pause(BATCH_PAUSE_MS);
  }
  return found;
}

/** The release's photo: the first one any version carries that makes a usable cover. */
async function groupPhoto(group: Release[]) {
  for (const url of new Set(group.flatMap((r) => r.photos))) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;
      const cover = await processImage(Buffer.from(await response.arrayBuffer()), "cover");
      if (cover.width < MIN_PHOTO_WIDTH && cover.height < MIN_PHOTO_WIDTH) continue;
      return cover;
    } catch {
      // Not an image sharp can read, or too odd a shape for a cover: try the next one.
    }
  }
  return null;
}

/** A copy of the photo as one story's cover (each story owns its file, so deleting one never breaks another). */
async function storeCover(cover: NonNullable<Awaited<ReturnType<typeof groupPhoto>>>, authorId: string) {
  const coverKey = newImageKey("cover", authorId);
  const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
  return { coverUrl, coverKey, coverWidth: cover.width, coverHeight: cover.height, coverBlur: cover.blurDataUrl };
}

/** India's date today, or the one asked for. */
function targetDay(arg: string | undefined): string {
  const day = arg ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Expected a date like 2026-10-05, got "${day}"`);
  return day;
}

async function main() {
  if (env.isProduction || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.FRONTEND_URL)) {
    throw new Error("Demo news is for local development only");
  }
  const args = process.argv.slice(2);
  const day = targetDay(args.find((arg) => !arg.startsWith("--")));
  // --languages=en,hi,kn: only these versions (owner 2026-10-10: Kannada, Hindi and English).
  const only = args
    .find((arg) => arg.startsWith("--languages="))
    ?.slice("--languages=".length)
    .split(",")
    .filter(Boolean) as PressLanguage[] | undefined;
  // --all-reporters: every Verified reporter files them, real accounts too (owner 2026-10-10: "use all reporters
  // account to publish, no issues"); default: the demo reporters only.
  const allReporters = args.includes("--all-reporters");
  const oneVersion = args.includes("--one-version");
  const listed = args
    .find((arg) => arg.startsWith("--prids="))
    ?.slice("--prids=".length)
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  // Who files in which language: the demo reporters' Press Pass languages (people, not the demo desks).
  const desks = [...DEMO_PUBLISHERS.map((p) => p.username), DEMO_TRAINEE.username];
  const reporters = await db
    .select({ id: user.id, languages: pressPass.languages })
    .from(user)
    .innerJoin(pressPass, eq(pressPass.userId, user.id))
    .where(
      allReporters
        ? and(eq(pressPass.level, "verified"), isNull(pressPass.revokedAt), isNotNull(user.username))
        : and(like(user.email, `%@${DEMO_EMAIL_DOMAIN}`), notInArray(user.username, desks)),
    );
  if (reporters.length === 0) throw new Error("No demo reporters found — run scripts/seed-state-reporters.ts first");
  const turns = new Map<string, number>();
  const reporterFor = (language: PressLanguage) => {
    const fluent = reporters.filter((r) => r.languages.includes(language));
    const candidates = fluent.length > 0 ? fluent : reporters.filter((r) => r.languages.includes("en"));
    const turn = turns.get(language) ?? 0;
    turns.set(language, turn + 1);
    return candidates[turn % candidates.length] as (typeof reporters)[number];
  };

  const withPhotos = (listed?.length ? await listedReleases(day, listed) : await releasesOf(day, await newestRelease()))
    .filter((r) => r.photos.length > 0 && r.paragraphs.length > 0 && r.language !== "other")
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  console.log(`[seed-pib-news] ${withPhotos.length} releases with photos; reading their other languages…`);
  const groups = await withTranslations(withPhotos);

  let created = 0;
  let skipped = 0;
  let index = 0;
  const counts = new Map<PressLanguage, number>();
  for (const [groupIndex, whole] of groups.entries()) {
    // --one-version (owner 2026-10-10: "all versions of one article not wanted"): one language per release, taking
    // turns through --languages (the next one it was issued in when it wasn't in that one).
    const offered = only ? whole.filter((r) => only.includes(r.language)) : whole;
    let group = offered;
    if (oneVersion && offered.length > 0) {
      const order = only ?? [...new Set(offered.map((r) => r.language))];
      const start = groupIndex % order.length;
      const pick = [...order.slice(start), ...order.slice(0, start)]
        .map((language) => offered.find((r) => r.language === language))
        .find(Boolean);
      group = pick ? [pick] : [];
    }
    if (group.length === 0) continue;
    const photo = await groupPhoto(whole);
    if (!photo) continue;
    for (const release of group) {
      const title = headline(release.title);
      const [existing] = await db.select({ id: article.id }).from(article).where(eq(article.title, title)).limit(1);
      if (existing) {
        skipped++;
        continue;
      }
      const author = reporterFor(release.language);
      const cover = await storeCover(photo, author.id);
      counts.set(release.language, (counts.get(release.language) ?? 0) + 1);
      index++;
      const source = `${PIB}/PressReleasePage.aspx?PRID=${release.prid}`;
      const bodyHtml = sanitizeArticleHtml(
        release.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("") +
          `<p><em>Source: <a href="${source}">Press Information Bureau (PIB), Government of India</a></em></p>`,
      );
      const bodyText = htmlToText(bodyHtml);
      const values = {
        authorId: author.id,
        status: "published" as const,
        title,
        bodyHtml,
        bodyText,
        excerpt: makeExcerpt(htmlToExcerptText(bodyHtml)),
        readingMinutes: readingMinutes(bodyText),
        ...cover,
        // One section for every version: the lead's (its ministry name may be in English).
        category: categoryOf(whole.find((r) => r.language === "en") ?? release),
        language: release.language,
        template: POSTER_TEMPLATE_VALUES[index % POSTER_TEMPLATE_VALUES.length],
        createdAt: release.publishedAt,
        updatedAt: release.publishedAt,
        publishedAt: release.publishedAt,
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
  }
  const byLanguage = [...counts].map(([code, count]) => `${code} ${count}`).join(", ");
  console.log(`[seed-pib-news] ${created} new stories from ${groups.length} releases, ${skipped} already there · ${byLanguage}`);
}

try {
  await main();
} catch (error) {
  console.error("[seed-pib-news] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
