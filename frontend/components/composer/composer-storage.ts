import { z } from "zod";
import { posterFrameSchema } from "@/lib/shared/contracts";
import type { ComposerFields } from "./composer-model";

/*
 * localStorage autosave of the in-progress composer, so a refresh or a crashed tab never loses a
 * story. One record per viewer and draft (`new` until the first save). Every access is wrapped:
 * storage can be unavailable (private mode, quota) and the composer must keep working.
 */

const VERSION = 1;

const recordSchema = z.object({
  v: z.literal(VERSION),
  title: z.string().max(1_000),
  bodyHtml: z.string().max(400_000),
  cover: z
    .object({
      url: z.string().min(1),
      key: z.string().min(1),
      width: z.number().nullable(),
      height: z.number().nullable(),
      blurDataUrl: z.string().nullable(),
    })
    .nullable(),
  /** Video stories (records written before videos existed have none). */
  video: z
    .object({
      url: z.string().min(1),
      key: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      durationMs: z.number().int().positive(),
    })
    .nullable()
    .optional()
    .default(null),
  /** The full article's image / video (records written before it existed have none). */
  articleImage: z
    .object({
      url: z.string().min(1),
      key: z.string().min(1),
      width: z.number().nullable(),
      height: z.number().nullable(),
      blurDataUrl: z.string().nullable(),
    })
    .nullable()
    .optional()
    .default(null),
  articleVideo: z
    .object({
      url: z.string().min(1),
      key: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      durationMs: z.number().int().positive(),
    })
    .nullable()
    .optional()
    .default(null),
  /** Stories no longer carry a source link (the publisher is the source); old records may still have one — ignored. */
  linkUrl: z.string().max(4_096).optional(),
  /** Records written before categories existed have none (validated again on restore). */
  category: z.string().max(40).optional().default(""),
  district: z.string().max(60).optional().default(""),
  /** The story's language ("" = automatic; records written before languages existed have none). Validated on restore. */
  language: z.string().max(8).optional().default(""),
  /** Reel poster design ("" = not chosen yet; records written before templates existed have none). Validated on restore. */
  template: z.string().max(40).optional(),
  /** The photo's place in the poster (records written before it existed have none = centred). */
  posterFrame: posterFrameSchema.nullable().optional().default(null),
  /** epoch ms of the local write */
  savedAt: z.number(),
  /** `updatedAt` of the server draft these edits were made on top of (null for a new story). */
  baseUpdatedAt: z.string().nullable(),
});

export type AutosaveRecord = z.infer<typeof recordSchema>;

export function autosaveKey(viewerId: string, draftId: string | null): string {
  return `webnews:composer:v${VERSION}:${viewerId}:${draftId ?? "new"}`;
}

export function readAutosave(key: string): AutosaveRecord | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeAutosave(key: string, fields: ComposerFields, baseUpdatedAt: string | null): void {
  const record: AutosaveRecord = { v: VERSION, ...fields, savedAt: Date.now(), baseUpdatedAt };
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Quota exceeded / storage disabled: autosave is best effort.
  }
}

export function clearAutosave(...keys: string[]): void {
  try {
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when the record holds anything worth restoring. */
export function recordHasContent(record: AutosaveRecord): boolean {
  return Boolean(record.title.trim() || record.bodyHtml || record.cover || record.articleImage);
}
