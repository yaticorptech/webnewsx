import { z } from "zod";
import { FOR_YOU_WINDOW_DAYS, SPOTLIGHT_RANKING } from "../shared/contracts.js";
import { ApiError } from "./errors.js";

/**
 * "For You" ranking (SPEC §3.4b). The SQL in queries/foryou.ts computes exactly these formulas;
 * the pure functions below are the reference implementation (unit-tested) and share the constants.
 *
 *   engagement = views·1 + likes·4 + shares·6
 *   hot        = (engagement + 1)^0.9 / (ageHours + 2)^1.4          (age measured against the page's asOf)
 *   base       = age < 2h ? max(hot, floor) : hot                    (floor = 20th percentile of the window)
 *   score      = base · follow 1.6 · likedAuthor 1.25 · seen 0.5 · own 0.8 · active Spotlight 2.5
 *   order      = by score, except unseen < 2h stories are lifted into fresh slots (best one + 2 newest, freshSlots);
 *                then at most one Spotlight per 10-story block (placeSpotlights). Editor's Picks lead page 1
 *                and are left out of the ranked list.
 */
export const RANKING = {
  weights: { view: 1, like: 4, share: 6 },
  engagementExponent: 0.9,
  ageOffsetHours: 2,
  gravity: 1.4,
  windowDays: FOR_YOU_WINDOW_DAYS,
  coldStartHours: 2,
  coldStartPercentile: 0.2,
  likedAuthorDays: 30,
  multipliers: { follows: 1.6, likedAuthor: 1.25, seen: 0.5, own: 0.8 },
  /**
   * Guaranteed exposure for stories younger than 2h that the viewer hasn't seen: the best-scoring
   * one sorts no lower than just before natural rank 2, the two newest of the rest before ranks 4
   * and 7 (≈ positions 2, 5 and 9 of page 1). The 20th-percentile floor alone can't lift a new
   * story past established ones with thousands of views.
   */
  freshSlots: { best: 2, newest: [4, 7] },
  /** Same author at most this many times in a row within a page. */
  maxAuthorRun: 2,
  /** Deepest offset a cursor may carry (keeps OFFSET scans bounded). */
  maxOffset: 5_000,
} as const;

export type EngagementCounts = { viewCount: number; likeCount: number; shareCount: number };

export function engagementOf({ viewCount, likeCount, shareCount }: EngagementCounts): number {
  const w = RANKING.weights;
  return viewCount * w.view + likeCount * w.like + shareCount * w.share;
}

/** Hours between `publishedAt` and `asOf` (never negative). */
export function ageHours(publishedAt: Date, asOf: Date): number {
  return Math.max(0, (asOf.getTime() - publishedAt.getTime()) / 3_600_000);
}

export function hotScore(engagement: number, hours: number): number {
  return Math.pow(engagement + 1, RANKING.engagementExponent) / Math.pow(Math.max(0, hours) + RANKING.ageOffsetHours, RANKING.gravity);
}

/** Cold start: stories younger than 2h never score below the window's floor. */
export function withColdStart(hot: number, hours: number, floor: number): number {
  return hours < RANKING.coldStartHours ? Math.max(hot, floor) : hot;
}

export type PersonalSignals = { follows: boolean; likedAuthor: boolean; seen: boolean; own: boolean };

export function personalMultiplier(signals: PersonalSignals): number {
  const m = RANKING.multipliers;
  return (signals.follows ? m.follows : 1) * (signals.likedAuthor ? m.likedAuthor : 1) * (signals.seen ? m.seen : 1) * (signals.own ? m.own : 1);
}

/** Continuous percentile (same definition as PostgreSQL `percentile_cont`); 0 for an empty list. */
export function percentileCont(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lo = sorted[lower] as number;
  const hi = sorted[upper] as number;
  return lo + (hi - lo) * (position - lower);
}

/**
 * Re-orders one page so the same author never appears more than `maxRun` times in a row, moving
 * the next item by a different author forward. Keeps the ranked order otherwise; when no other
 * author is left on the page the run is unavoidable and is kept.
 */
export function diversify<T>(items: readonly T[], authorOf: (item: T) => string, maxRun: number = RANKING.maxAuthorRun): T[] {
  const pending = [...items];
  const out: T[] = [];
  while (pending.length > 0) {
    const tail = out.slice(-maxRun).map(authorOf);
    const blocked = tail.length === maxRun && tail.every((author) => author === tail[0]) ? tail[0] : undefined;
    const index = blocked === undefined ? 0 : pending.findIndex((item) => authorOf(item) !== blocked);
    const [next] = pending.splice(index === -1 ? 0 : index, 1);
    out.push(next as T);
  }
  return out;
}

export type RankedEntry = { id: string; score: number; publishedAt: number; fresh: boolean };

/**
 * Reference ordering (mirrors the SQL): by score desc; the best-scoring fresh entry sorts just
 * before natural rank `slots.best`, the i-th newest remaining fresh entry before `slots.newest[i]`,
 * unless they already rank higher.
 */
export function orderWithFreshSlots<T extends RankedEntry>(
  entries: readonly T[],
  slots: { best: number; newest: readonly number[] } = RANKING.freshSlots,
): T[] {
  const natural = [...entries].sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
  const best = natural.find((e) => e.fresh);
  const newest = natural.filter((e) => e.fresh && e !== best).sort((a, b) => b.publishedAt - a.publishedAt);
  const keyed = natural.map((entry, i) => {
    const slot = entry === best ? slots.best : entry.fresh ? slots.newest[newest.indexOf(entry)] : undefined;
    return { entry, key: slot === undefined ? i + 1 : Math.min(i + 1, slot - 0.5) };
  });
  return keyed.sort((a, b) => a.key - b.key).map(({ entry }) => entry);
}

/* ─────────────── Spotlight placement (SPEC §3.11) ─────────────── */

/**
 * Reference implementation of the SQL placement: `natural` = 1-based positions (in the ranked list, after the
 * ×2.5 boost) of the spotlighted stories in order; `picks` = Editor's Picks shown before the ranked list
 * on page 1. Each spotlight keeps its natural position unless an earlier spotlight already occupies that
 * 10-story front-page block — then it becomes the lead of the next free block. Returns final ranked positions.
 */
export function placeSpotlights(natural: readonly number[], picks = 0, blockSize: number = SPOTLIGHT_RANKING.blockSize): number[] {
  const out: number[] = [];
  let previousBlock = -1;
  for (const position of natural) {
    const display = position + picks;
    const block = Math.max(previousBlock + 1, Math.floor((display - 1) / blockSize));
    const lowest = block === 0 ? picks + 1 : 1;
    const offset = Math.max(lowest, Math.min(blockSize, display - blockSize * block));
    out.push(blockSize * block + offset - picks);
    previousBlock = block;
  }
  return out;
}

/* ─────────────── Cursor: base64url JSON { asOf, offset, picks? } ─────────────── */

/** `picks` = Editor's Picks that led page 1 (keeps Spotlight blocks aligned with the displayed blocks). */
export type RankCursor = { asOf: Date; offset: number; picks?: number };

const rankCursorSchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  offset: z.number().int().min(0).max(RANKING.maxOffset),
  picks: z.number().int().min(0).max(3).optional(),
});

export function encodeRankCursor(cursor: RankCursor): string {
  const payload = { asOf: cursor.asOf.toISOString(), offset: cursor.offset, ...(cursor.picks ? { picks: cursor.picks } : {}) };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** `undefined`/empty → null. Malformed → 400 `invalid_cursor`. A future `asOf` is clamped to `now`. */
export function decodeRankCursor(raw: string | undefined | null, now: Date = new Date()): RankCursor | null {
  if (!raw) return null;
  try {
    const parsed = rankCursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    const asOf = new Date(parsed.asOf);
    if (Number.isNaN(asOf.getTime())) throw new Error("bad date");
    return { asOf: asOf > now ? now : asOf, offset: parsed.offset, ...(parsed.picks ? { picks: parsed.picks } : {}) };
  } catch {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
}
