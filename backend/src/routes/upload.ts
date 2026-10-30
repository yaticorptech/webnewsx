import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { ApiError, validationError } from "../lib/errors.js";
import { processImage } from "../lib/images.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { deleteQuietly, newImageKey, newVideoKey, storage } from "../lib/storage.js";
import { processVideo } from "../lib/video.js";
import { canPublish } from "../lib/roles.js";
import { mustViewer, pressPassRequired, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { LIMITS, type UploadedImage, type UploadedVideo } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

const kindSchema = z.enum(["avatar", "cover", "article", "frame", "logo", "video"]);
const VIDEO_MB = Math.round(LIMITS.videoUploadMaxBytes / (1024 * 1024));

export function uploadRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // POST /api/upload — multipart: file, kind: avatar | cover | article (≤ 8 MB image; article = any shape, stored with
  // the covers) | frame (the reporter's own poster frame — any image; saved to their account) | video (≤ 200 MB, ≤ 30 s, or `trim=1` to keep the first 30 s of a longer clip — lib/video.ts).
  // Avatars are allowed before onboarding (the onboarding form needs one); covers, article images and videos need a
  // finished profile and publishing rights (Reporter / Editor Desk).
  app.post("/", requireUser, rateLimit(limiter, "upload", RATE_LIMITS.upload, "user"), async (c) => {
    const viewer = mustViewer(c);
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new ApiError(400, "invalid_upload", "Send the image as multipart/form-data");
    }

    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: false });
    } catch {
      throw new ApiError(400, "invalid_upload", "Could not read the upload");
    }

    const kind = kindSchema.safeParse(form.kind);
    if (!kind.success) throw validationError({ kind: "kind must be 'avatar', 'cover', 'article', 'frame', 'logo' or 'video'" });
    if (kind.data !== "avatar" && !viewer.onboarded) {
      throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
    }
    if (kind.data !== "avatar" && !canPublish(viewer)) throw pressPassRequired();

    const file = form.file;
    if (kind.data === "video") {
      if (!(file instanceof File) || file.size === 0) throw validationError({ file: "Choose a video to upload" });
      if (file.size > LIMITS.videoUploadMaxBytes) throw new ApiError(413, "file_too_large", `Videos must be ${VIDEO_MB} MB or smaller`);
      const video = await processVideo(file, { trim: form.trim === "1" || form.trim === "true" });
      const videoKey = newVideoKey(viewer.id);
      const posterKey = newImageKey("cover", viewer.id);
      const videoUrl = await storage.put(videoKey, video.buffer, "video/mp4");
      let posterUrl: string;
      try {
        posterUrl = await storage.put(posterKey, video.poster.buffer, video.poster.contentType);
      } catch (error) {
        await deleteQuietly(videoKey);
        throw error;
      }
      const body: UploadedVideo = {
        video: { url: videoUrl, key: videoKey, width: video.width, height: video.height, durationMs: video.durationMs },
        poster: { url: posterUrl, key: posterKey, width: video.poster.width, height: video.poster.height, blurDataUrl: video.poster.blurDataUrl },
        trimmed: video.trimmed,
        originalDurationMs: video.originalDurationMs,
      };
      return c.json(body, 201);
    }

    if (!(file instanceof File) || file.size === 0) throw validationError({ file: "Choose an image to upload" });
    if (file.size > LIMITS.uploadMaxBytes) throw new ApiError(413, "file_too_large", "Images must be 8 MB or smaller");

    const processed = await processImage(Buffer.from(await file.arrayBuffer()), kind.data);
    const key = newImageKey(kind.data === "avatar" ? "avatar" : "cover", viewer.id);
    const url = await storage.put(key, processed.buffer, processed.contentType);
    // A frame (owner 2026-10-08) becomes the account's frame at once; the one it replaces stays as long as a story
    // still uses it (the upload sweep removes it once nothing does).
    if (kind.data === "frame") {
      await db.update(user).set({ posterOverlayUrl: url, posterOverlayKey: key }).where(eq(user.id, viewer.id));
    }
    const body: UploadedImage = { url, key, width: processed.width, height: processed.height, blurDataUrl: processed.blurDataUrl };
    return c.json(body, 201);
  });

  return app;
}
