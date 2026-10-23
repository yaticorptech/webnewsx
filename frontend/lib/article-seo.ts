import { CATEGORY_LABELS, PRESS_LANGUAGE_LABELS, categoryLabel, type ArticleDetail, type PressLanguage } from "@/lib/shared/contracts";

/*
 * What search engines and link previews read about a story (owner 2026-10-22: "SEO, canonical tags, keywords for every
 * article"): its own summary, keywords, section, language and dates — built from the story, never the site's defaults.
 */

/** The story's summary for meta description / og:description / JSON-LD: the blurb, else the excerpt, else its first lines. */
export function articleSummary(article: ArticleDetail, max = 160): string {
  const source = (article.blurb || article.excerpt || plainText(article.bodyHtml)).replace(/\s+/g, " ").trim();
  if (source.length <= max) return source;
  const cut = source.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s.,;:!?\-–—]+$/u, "")}…`;
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

/** English words too common to be keywords. */
const STOP = new Set(
  "a an and are as at be been but by for from has have he her his in into is it its of on or our she that the their them they this to was were will with who what when where why how after before over under about than then also more most new news says said".split(
    " ",
  ),
);

/**
 * Keywords: the section, sub category and district, the language, the reporter, then the headline's own words (the
 * longest first; any script). At most `max`, no repeats.
 */
export function articleKeywords(article: ArticleDetail, max = 12): string[] {
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    const v = value?.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  if (article.category) add(CATEGORY_LABELS[article.category]);
  add(article.subcategory);
  if (article.category === "karnataka") add(article.district);
  if (article.language) add(`${PRESS_LANGUAGE_LABELS[article.language]} news`);
  add(article.author.name);
  const words = article.title
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    if (out.length >= max) break;
    add(word);
  }
  add("WebNEWS");
  return out.slice(0, max);
}

/** The section shown to search engines ("Mysuru, Karnataka", "Sports"). */
export function articleSection(article: ArticleDetail): string | null {
  return article.category ? categoryLabel(article.category, article.district) : null;
}

/** BCP-47 language of the story ("kn", "hi"…) and its Open Graph locale ("kn_IN"). English: "en" / "en_IN". */
export function articleLanguage(article: ArticleDetail, fallback: PressLanguage): { lang: string; locale: string } {
  const lang = article.language ?? fallback;
  return { lang, locale: `${lang.length === 2 ? lang : lang.slice(0, 2)}_IN` };
}
