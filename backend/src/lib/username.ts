import { randomInt } from "node:crypto";
import { USERNAME_MAX, normalizeUsername, sanitizeUsernameInput, validateNewUsername } from "../shared/contracts.js";

export { USERNAME_MESSAGES, normalizeUsername, validateUsernameFormat, RESERVED_USERNAMES } from "../shared/contracts.js";

const SUFFIXES = ["news", "daily", "press", "wire", "report", "post", "journal", "times", "desk", "dispatch"];
const PREFIXES = ["the", "real", "its", "hey"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Reduces anything to a letters-and-dots stem usable as a suggestion base. */
export function suggestionStem(input: string): string {
  const stem = sanitizeUsernameInput(normalizeUsername(input))
    .replace(/[._]{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "");
  return stem.length >= 2 ? stem.slice(0, 20).replace(/[._]+$/, "") : "reader";
}

function randomLetters(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += LETTERS[randomInt(LETTERS.length)];
  return out;
}

/**
 * Candidate usernames (letters and dots only, format-valid, not reserved) derived from `input`.
 * Ordered by preference; the caller filters out taken ones.
 */
export function usernameCandidates(input: string, count = 12): string[] {
  const stem = suggestionStem(input);
  // New usernames need 4+ letters before the dot (owner 2026-10-15 / 2026-10-23): a short name ("ravi", "jane.doe") is also tried
  // joined up ("janedoe") and with a prefix ("theravi"), so it never ends up with no suggestions at all.
  const compact = stem.replace(/[._]/g, "");
  const bases = [stem, compact, ...PREFIXES.map((p) => `${p}${compact}`)];
  // The name as typed, then joined up ("harikiran") and with an underscore ("hari_kiran") come first when they're free
  // (owner 2026-10-31).
  const raw = [
    stem,
    compact,
    stem.replace(/\./g, "_"),
    ...SUFFIXES.slice(0, 4).map((s) => `${stem}.${s}`),
    ...PREFIXES.slice(0, 2).map((p) => `${p}.${stem}`),
    ...SUFFIXES.slice(4).map((s) => `${stem}.${s}`),
    ...PREFIXES.slice(2).map((p) => `${p}.${stem}`),
    `${stem}.${randomLetters(3)}`,
    `${stem}.${randomLetters(4)}`,
    `${stem}${randomLetters(3)}`,
    ...bases.slice(1).flatMap((base) => [...SUFFIXES.slice(0, 4).map((s) => `${base}.${s}`), `${base}.${randomLetters(3)}`]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const trimmed = candidate.slice(0, USERNAME_MAX).replace(/[._]+$/, "");
    if (seen.has(trimmed) || !validateNewUsername(trimmed).ok) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= count) break;
  }
  return out;
}
