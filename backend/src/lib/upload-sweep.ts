import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, conversation, user } from "../db/schema.js";
import { UPLOAD_FOLDERS, storage as defaultStorage, type StorageDriver } from "./storage.js";

/**
 * Uploads are stored the moment they arrive (the composer and onboarding need a URL before anything is saved),
 * so abandoned avatars/covers/videos would pile up forever. Anything older than this that no account (`user.image`),
 * no group / community photo (`conversation.image`), no poster frame (`user.poster_overlay_key`) and no story (`article.cover_key` /
 * `video_key` / `article_image_key` / `article_video_key` / `poster_overlay_key`, drafts included) references is deleted.
 */
export const ORPHAN_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

export type SweepResult = { scanned: number; deleted: number };

/** Keys (of `keys`) still referenced by a user's avatar or any article's cover, video or article image / video. */
async function referencedKeys(keys: string[], driver: StorageDriver): Promise<Set<string>> {
  const urls = new Map(keys.map((key) => [driver.urlFor(key), key]));
  const [avatars, chatPhotos, covers, videos, articleImages, articleVideos, frames, storyFrames] = await Promise.all([
    db.select({ image: user.image }).from(user).where(inArray(user.image, [...urls.keys()])),
    db.select({ image: conversation.image }).from(conversation).where(inArray(conversation.image, [...urls.keys()])),
    db.select({ key: article.coverKey }).from(article).where(inArray(article.coverKey, keys)),
    db.select({ key: article.videoKey }).from(article).where(inArray(article.videoKey, keys)),
    db.select({ key: article.articleImageKey }).from(article).where(inArray(article.articleImageKey, keys)),
    db.select({ key: article.articleVideoKey }).from(article).where(inArray(article.articleVideoKey, keys)),
    // Poster frames (owner 2026-10-08): the account's current one, and the ones stories were saved with.
    db.select({ key: user.posterOverlayKey }).from(user).where(inArray(user.posterOverlayKey, keys)),
    db.select({ key: article.posterOverlayKey }).from(article).where(inArray(article.posterOverlayKey, keys)),
  ]);
  const used = new Set<string>();
  for (const { image } of [...avatars, ...chatPhotos]) {
    const key = image ? urls.get(image) : undefined;
    if (key) used.add(key);
  }
  for (const { key } of [...covers, ...videos, ...articleImages, ...articleVideos, ...frames, ...storyFrames]) if (key) used.add(key);
  return used;
}

/** Deletes unreferenced uploads older than `olderThanMs`. Safe to run while the app serves traffic. */
export async function sweepOrphanUploads(options: { olderThanMs?: number; driver?: StorageDriver; now?: number } = {}): Promise<SweepResult> {
  const driver = options.driver ?? defaultStorage;
  const cutoff = (options.now ?? Date.now()) - (options.olderThanMs ?? ORPHAN_UPLOAD_TTL_MS);
  let scanned = 0;
  let deleted = 0;
  let batch: string[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const used = await referencedKeys(batch, driver);
    for (const key of batch) {
      if (used.has(key)) continue;
      try {
        await driver.delete(key);
        deleted++;
      } catch (error) {
        console.warn(`[uploads] could not delete ${key}:`, error instanceof Error ? error.message : error);
      }
    }
    batch = [];
  };

  for (const folder of UPLOAD_FOLDERS) {
    for await (const object of driver.list(`${folder}/`)) {
      scanned++;
      if (object.lastModified.getTime() > cutoff) continue;
      batch.push(object.key);
      if (batch.length >= BATCH) await flush();
    }
  }
  await flush();
  return { scanned, deleted };
}

/** Runs the sweep a few minutes after start, then every 6 hours (timers never keep the process alive). */
export function startUploadSweeper(): () => void {
  const run = () => {
    sweepOrphanUploads()
      .then(({ deleted }) => {
        if (deleted > 0) console.log(`[uploads] removed ${deleted} unused upload(s) older than 24h`);
      })
      .catch((error) => console.warn("[uploads] sweep failed:", error instanceof Error ? error.message : error));
  };
  const first = setTimeout(run, 5 * 60 * 1000);
  const every = setInterval(run, 6 * 60 * 60 * 1000);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
