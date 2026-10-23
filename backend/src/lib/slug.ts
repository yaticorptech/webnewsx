import { randomInt } from "node:crypto";
import { SHORT_CODE_LENGTH } from "../shared/contracts.js";
import { isUniqueViolation } from "./errors.js";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_BASE_MAX = 80;

/*
 * Indian scripts → Latin letters for readable links (owner 2026-10-22: a Kannada story's link was just "story-x7k2qp").
 * The nine Brahmic blocks (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam) share one
 * layout, so one table by offset in the block covers them all: "ಮೈಸೂರು ಅರಮನೆ" → "maisuru aramane". A plain phonetic
 * spelling for URLs, not a scholarly transliteration.
 */
const INDIC_BLOCKS = [0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00];
const CONSONANTS: Record<number, string> = {
  0x15: "k", 0x16: "kh", 0x17: "g", 0x18: "gh", 0x19: "n", 0x1a: "ch", 0x1b: "chh", 0x1c: "j", 0x1d: "jh", 0x1e: "n",
  0x1f: "t", 0x20: "th", 0x21: "d", 0x22: "dh", 0x23: "n", 0x24: "t", 0x25: "th", 0x26: "d", 0x27: "dh", 0x28: "n",
  0x29: "n", 0x2a: "p", 0x2b: "ph", 0x2c: "b", 0x2d: "bh", 0x2e: "m", 0x2f: "y", 0x30: "r", 0x31: "r", 0x32: "l",
  0x33: "l", 0x34: "l", 0x35: "v", 0x36: "sh", 0x37: "sh", 0x38: "s", 0x39: "h",
  0x58: "q", 0x59: "kh", 0x5a: "g", 0x5b: "z", 0x5c: "d", 0x5d: "dh", 0x5e: "f", 0x5f: "y",
};
const VOWELS: Record<number, string> = {
  0x05: "a", 0x06: "aa", 0x07: "i", 0x08: "ee", 0x09: "u", 0x0a: "oo", 0x0b: "ru", 0x0c: "lu", 0x0d: "e", 0x0e: "e",
  0x0f: "e", 0x10: "ai", 0x11: "o", 0x12: "o", 0x13: "o", 0x14: "au", 0x60: "ru", 0x61: "lu",
};
const SIGNS: Record<number, string> = {
  0x3e: "a", 0x3f: "i", 0x40: "ee", 0x41: "u", 0x42: "oo", 0x43: "ru", 0x44: "ru", 0x45: "e", 0x46: "e", 0x47: "e",
  0x48: "ai", 0x49: "o", 0x4a: "o", 0x4b: "o", 0x4c: "au", 0x62: "lu", 0x63: "lu",
};

function indicOffset(code: number): number | null {
  for (const base of INDIC_BLOCKS) if (code >= base && code < base + 0x80) return code - base;
  return null;
}

export function transliterateIndic(input: string): string {
  let out = "";
  let pendingA = false;
  for (const char of input) {
    const offset = indicOffset(char.codePointAt(0) ?? 0);
    if (offset === null) {
      if (pendingA) out += "a";
      pendingA = false;
      // Zero-width joiners only shape the letters.
      if (char !== "\u200c" && char !== "\u200d") out += char;
      continue;
    }
    if (SIGNS[offset] !== undefined) {
      out += SIGNS[offset];
      pendingA = false;
    } else if (offset === 0x4d) {
      pendingA = false; // virama: no vowel
    } else if (offset === 0x3c) {
      // nukta: leaves the consonant as it is
    } else {
      if (pendingA) out += "a";
      pendingA = false;
      if (CONSONANTS[offset] !== undefined) {
        out += CONSONANTS[offset];
        pendingA = true;
      } else if (VOWELS[offset] !== undefined) out += VOWELS[offset];
      else if (offset === 0x02 || offset === 0x01) out += "m";
      else if (offset === 0x03) out += "h";
      else if (offset >= 0x66 && offset <= 0x6f) out += String(offset - 0x66);
    }
  }
  if (pendingA) out += "a";
  return out;
}

/** kebab-case ASCII from any title ("Élan & Co.: 2026!" → "elan-co-2026"; Indian scripts are spelled in Latin letters). */
export function kebab(input: string): string {
  const ascii = transliterateIndic(input)
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
