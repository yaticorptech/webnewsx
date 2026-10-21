import sanitizeHtml from "sanitize-html";
import { LIMITS } from "../shared/contracts.js";

const WORDS_PER_MINUTE = 220;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower] as string;
    if (lower.startsWith("#x")) return safeFromCodePoint(Number.parseInt(lower.slice(2), 16)) ?? match;
    if (lower.startsWith("#")) return safeFromCodePoint(Number.parseInt(lower.slice(1), 10)) ?? match;
    return match;
  });
}

function safeFromCodePoint(code: number): string | null {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  return String.fromCodePoint(code);
}

/** Plain text from (sanitized) HTML: block boundaries become spaces, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  const spaced = html.replace(/<\/?(p|br|h[1-6]|li|ul|ol|blockquote|pre|hr|div)\b[^>]*>/gi, " ");
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

const BLOCK_END = "\uE000";

/**
 * Like htmlToText, but block boundaries (headings, paragraphs, list items…) read as sentence
 * breaks: "…next week.</p><h2>What next</h2><p>More" → "…next week. What next. More". For excerpts.
 */
export function htmlToExcerptText(html: string): string {
  const marked = html
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)\s*>/gi, BLOCK_END)
    .replace(/<(br|hr)\b[^>]*>/gi, BLOCK_END);
  return htmlToText(marked)
    .replace(new RegExp(`\\s*(?:${BLOCK_END}\\s*)+`, "g"), (match: string, offset: number, whole: string) => {
      if (offset + match.length === whole.length) return "";
      const before = whole.slice(0, offset).trimEnd();
      if (!before) return "";
      return /[.!?…:;,"'”’)\]]$/u.test(before) ? " " : ". ";
    })
    .trim();
}

/** Excerpt ≤ 280 chars, cut on a word boundary with an ellipsis when truncated. */
export function makeExcerpt(text: string, max: number = LIMITS.excerptMax): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.replace(/[\s.,;:!?\-–—]+$/u, "")}…`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Minutes needed to finish at ~220 wpm (rounded up), minimum 1. */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.ceil(countWords(text) / WORDS_PER_MINUTE));
}

/** "https://www.bbc.co.uk/news/x" → "bbc.co.uk". Null for anything that isn't an http(s) URL. */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
