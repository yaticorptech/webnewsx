import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { siteUrl } from "./config";

/**
 * tailwind-merge only knows Tailwind's default scale; teach it our custom tokens so
 * `cn("text-headline", "text-ink")` keeps both (font-size vs colour groups).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "kicker"] }],
    },
  },
});

/** Merge conditional class names, resolving Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Absolute URL on the public site origin (share links, Open Graph). Absolute inputs pass through. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

const SAFE_BASE = "http://next.invalid";

/** Whitespace, control / zero-width characters or a backslash — all things URL parsers strip or reinterpret. */
function hasUnsafeUrlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || char === "\\" || /\s/u.test(char)) return true;
  }
  return false;
}

/**
 * Validates a post-login `next` target: only same-site paths. Browsers drop tabs/newlines and read "\\" as
 * "/" when resolving URLs ("/\t/evil.com" → "//evil.com"), so any control character, whitespace or
 * backslash is refused outright, and the value is resolved to make sure it stays on this origin. Returns the
 * normalised path (+ query + hash), or `fallback`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || hasUnsafeUrlChar(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, SAFE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== SAFE_BASE) return fallback;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Initials for avatar fallbacks: "Ada Lovelace" → "AL", "ada" → "A". */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
