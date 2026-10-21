import { randomInt } from "node:crypto";
import { SHORT_CODE_LENGTH } from "../shared/contracts.js";
import { isUniqueViolation } from "./errors.js";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_BASE_MAX = 80;

/** kebab-case ASCII from any title ("Élan & Co.: 2026!" → "elan-co-2026"). */
export function kebab(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length <= SLUG_BASE_MAX) return ascii;
  const cut = ascii.slice(0, SLUG_BASE_MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

/** 6-char lowercase alphanumeric id. */
export function shortId(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return out;
}

/** Article slug: kebab(title) + "-" + 6-char id (falls back to "story" for titles with no ASCII). */
export function makeSlug(title: string, id: string = shortId()): string {
  return `${kebab(title) || "story"}-${id}`;
}

/** A story's share-link code (`/s/<code>`): SHORT_CODE_LENGTH chars of a–z 0–9 (36^7 ≈ 78 billion codes). */
export function makeShortCode(): string {
  return shortId(SHORT_CODE_LENGTH);
}

/**
 * True when a write lost the (astronomically rare) race for a public link — the slug or the short code is taken.
 * Publishing sits in a retry loop that draws fresh ones.
 */
export function isLinkCollision(error: unknown): boolean {
  return isUniqueViolation(error, "article_slug_unique") || isUniqueViolation(error, "article_short_code_unique");
}
