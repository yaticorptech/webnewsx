import { z } from "zod";
import { ApiError } from "./errors.js";

/**
 * Opaque keyset cursor: base64url(JSON [isoTimestamp, id]).
 * Used with (publishedAt, id) for feeds, (updatedAt, id) for drafts, (createdAt, userId) for follow lists.
 */
export type Cursor = { at: Date; id: string };

const tupleSchema = z.tuple([z.iso.datetime({ offset: true }), z.string().min(1).max(128)]);

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id]), "utf8").toString("base64url");
}

/** Decodes a cursor; `undefined`/empty → null. Malformed → 400 `invalid_cursor`. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = tupleSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    const at = new Date(parsed[0]);
    if (Number.isNaN(at.getTime())) throw new Error("bad date");
    return { at, id: parsed[1] };
  } catch {
    throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
  }
}

/**
 * Given `limit + 1` rows, returns the page and the cursor for the next one.
 */
export function paginate<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(cursorOf(last).at, cursorOf(last).id) : null };
}
