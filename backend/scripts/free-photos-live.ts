/**
 * Owner 2026-11-05: "create appropriate image based on title … I need real images" (no paid AI key). The stories whose
 * credited photo was swapped for a made title cover get a real photo instead: CC0 / public-domain only (no credit
 * needed), from Openverse, then Wikimedia Commons, searched with words fitting each headline; never the same photo
 * twice. The made cover's files are deleted from storage. Dry run unless `--apply`. Input: made.json (id, title).
 */
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { closeDatabase, db } from "../src/db/client.js";
import { article } from "../src/db/schema.js";
import { processImage } from "../src/lib/images.js";
import { deleteQuietly, newImageKey, storage } from "../src/lib/storage.js";

const APPLY = process.argv.includes("--apply");
const LIST = process.argv.find((a) => a.endsWith(".json")) ?? "";
const HEADERS = { "User-Agent": "WebNewsX-editorial/1.0 (https://www.webnewsx.com)" };
const FREE = /^(CC0|Public domain|PD\b|PD-)/i;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Searches per story (index in made.json), tried in turn. */
const Q: string[][] = process.env.Q_JSON ? JSON.parse(process.env.Q_JSON) : [
  ["construction workers India", "road construction India"],
  ["offshore oil rig", "oil drilling platform sea"],
  ["protest India", "dharna India", "Bangalore"],
  ["Mysore Palace", "Mysuru"],
  ["students computer training India", "Bangalore skyline"],
  ["File:The Indian Pariah Dog.jpg"],
  ["post office India", "Indian postman"],
  ["Malabar tree toad", "Western Ghats frog"],
  ["sugarcane harvest India", "sugarcane field"],
  ["orchid flowers", "plant nursery saplings"],
  ["Indian rupee notes", "Indian currency"],
  ["File:Courtroom One Gavel - Flickr - Joe Gratz.jpg"],
  ["Karnataka High Court", "courtroom", "judge gavel"],
  ["Gadag Karnataka", "Karnataka flag"],
  ["Indian textile handloom saree", "handloom weaving India"],
  ["farmers protest India road", "sugarcane field"],
  ["cricket stadium", "Eden Park Auckland"],
  ["File:Seethaswayamvaram Kathakali 13.jpg"],
  ["vaccination syringe", "vaccine injection"],
  ["KSRTC bus", "Indian bus station"],
  ["Karnataka bus", "India bus station passengers"],
  ["ov:sugarcane field", "ov:sugar cane harvest"],
  ["Vidhana Soudha", "Bangalore Vidhana Soudha"],
  ["Bombay Stock Exchange", "stock market chart"],
  ["camera lens", "computer screen code"],
  ["File:Sir Ganga Ram Hospital Top View.jpg"],
  ["street dog India", "stray dogs India"],
  ["bus fire", "burnt bus"],
  ["Formula One race car", "Formula 1 Mexico"],
  ["Milky Way galaxy", "galaxy stars night sky"],
  ["power lines electricity pylon", "high voltage power lines"],
  ["ov:Karnataka flag", "Suvarna Vidhana Soudha"],
  ["farmland village Karnataka", "Indian village fields"],
  ["Kannada Rajyotsava", "Karnataka flag celebration"],
  ["drain sewage canal city", "Mangalore city"],
  ["Mumbai stock exchange", "oil refinery"],
  ["highway protest India farmers", "sugarcane bullock cart"],
  ["industrial estate India factory", "factory buildings"],
  ["ov:laptop keyboard typing", "ov:computer programming"],
  ["skyscraper construction crane", "Bangalore skyline"],
  ["fireworks night", "Diwali fireworks"],
  ["film reel cinema", "award trophy"],
  ["smartphone fraud scam", "smartphone screen hand"],
  ["smartphones", "laptop on desk"],
  ["Barkur", "Indian palace ruins"],
  ["Kolar Gold Fields", "stadium India"],
  ["masala dosa", "South Indian breakfast"],
  ["stock market trading screen", "Bombay Stock Exchange"],
  ["thunderstorm lightning", "dark rain clouds"],
  ["ov:Bangalore city", "ov:Bangalore"],
  ["Shinkansen bullet train", "high speed train"],
  ["ov:India election voters", "ov:ballot box"],
  ["Indian classroom teacher", "school classroom India"],
  ["Belgaum", "procession crowd India festival"],
  ["ov:hospital building", "File:Sir Ganga Ram Hospital Ambulance.jpg"],
  ["street sweeping cleaning city", "garbage collection city"],
  ["fishing boats harbour India", "Mangalore fishing harbour"],
  ["Indian sweets halwa", "dates fruit"],
  ["Karnataka flag", "Kannada flag"],
  ["cracked dry earth drought", "drought field"],
  ["File:Around Hitex cricket ground (58397).jpg", "ov:cricket match"],
  ["cotton plant", "cotton boll field"],
];

type CommonsPage = { title: string; imageinfo?: { thumburl?: string; descriptionurl: string; width: number; height: number; extmetadata?: Record<string, { value?: string }> }[] };

type Pick = { url: string; page: string; label: string; source: string };

async function openverse(q: string, used: Set<string>): Promise<Pick | null> {
  const params = new URLSearchParams({ q, license: "cc0,pdm", category: "photograph", aspect_ratio: "wide", size: "large", page_size: "20", mature: "false" });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as { results?: { url: string; foreign_landing_url: string; title: string; width?: number; height?: number }[] };
  for (const r of data.results ?? []) {
    if (used.has(r.url) || (r.width && r.width < 1000) || (r.width && r.height && r.width < r.height)) continue;
    return { url: r.url, page: r.foreign_landing_url, label: r.title ?? q, source: "openverse" };
  }
  return null;
}

async function commons(q: string, used: Set<string>): Promise<Pick | null> {
  const base = { prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", format: "json", formatversion: "2" };
  // "File:…" = that exact photo (picked by hand).
  const params = q.startsWith("File:")
    ? new URLSearchParams({ action: "query", titles: q, ...base })
    : new URLSearchParams({ action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${q} filetype:bitmap`, gsrlimit: "25", ...base });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const pages = ((await res.json()) as { query?: { pages?: CommonsPage[] } }).query?.pages ?? [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const licence = plain(info?.extmetadata?.LicenseShortName?.value ?? "");
    if (!info?.thumburl || !FREE.test(licence) || info.width < 1200 || info.width < info.height || used.has(info.thumburl)) continue;
    return { url: info.thumburl, page: info.descriptionurl, label: `${page.title} (${licence})`, source: "commons" };
  }
  return null;
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.length > 20_000 ? buffer : null;
}

const stories = JSON.parse(readFileSync(LIST, "utf8")) as { id: string; title: string }[];
const used = new Set<string>();
let done = 0;
try {
  for (const [index, story] of stories.entries()) {
    let found: { pick: Pick; buffer: Buffer } | null = null;
    for (const q of Q[index] ?? []) {
      // "ov:" = Openverse only; "File:" = Commons only.
      const searches = q.startsWith("ov:") ? [openverse] : q.startsWith("File:") ? [commons] : [commons, openverse];
      for (const search of searches) {
        await pause(800);
        const pick = await search(q.replace(/^ov:/, ""), used);
        const buffer = pick ? await download(pick.url) : null;
        if (pick && buffer) {
          found = { pick, buffer };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      console.log(`${index}. NONE  ${story.title.slice(0, 60)}`);
      continue;
    }
    used.add(found.pick.url);
    console.log(`${index}. ${story.title.slice(0, 55)}\n     → [${found.pick.source}] ${found.pick.label.slice(0, 80)}`);
    if (!APPLY) continue;
    const cover = await processImage(found.buffer, "cover").catch(() => null);
    const image = await processImage(found.buffer, "article").catch(() => null);
    if (!cover || !image) {
      console.log("     (unreadable image, skipped)");
      continue;
    }
    const [row] = await db.select({ authorId: article.authorId, coverKey: article.coverKey, articleImageKey: article.articleImageKey }).from(article).where(eq(article.id, story.id));
    if (!row) continue;
    const coverKey = newImageKey("cover", row.authorId);
    const articleImageKey = newImageKey("cover", row.authorId);
    await db
      .update(article)
      .set({
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
      })
      .where(eq(article.id, story.id));
    await deleteQuietly(row.coverKey);
    await deleteQuietly(row.articleImageKey);
    done++;
  }
  console.log(APPLY ? `${done} real photos in place` : "dry run (add --apply)");
} catch (error) {
  console.error("[free-photos-live] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
