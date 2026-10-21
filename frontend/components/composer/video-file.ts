import { LIMITS } from "@/lib/shared/contracts";
import type { FileProblem } from "./crop-image";

/*
 * Browser-only helpers for story videos (owner rule 2026-09-25: ≤ 30 seconds). The length is read here first, so a
 * longer clip gets the "keep the first 30 seconds?" question before anything is uploaded; the server checks again.
 */

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/*";

const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;
const VIDEO_MB = Math.round(LIMITS.videoUploadMaxBytes / (1024 * 1024));
/** Containers often read a few frames over a round number ("30 s" phone clips are 30.03 s). */
const TOLERANCE_MS = 500;

/** Some systems hand over .mov / .mkv files without a MIME type, so the extension counts too. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || (!file.type && VIDEO_EXTENSION.test(file.name));
}

export function checkVideoFile(file: File): FileProblem | null {
  if (file.size > LIMITS.videoUploadMaxBytes) {
    return { title: "That video is too large", description: `Choose a video under ${VIDEO_MB} MB.` };
  }
  return null;
}

export function isTooLong(durationMs: number): boolean {
  return durationMs > LIMITS.videoMaxSeconds * 1000 + TOLERANCE_MS;
}

/**
 * The clip's length from its metadata, or null when this browser can't read it (e.g. an HEVC .mov in some
 * browsers) — the upload then goes ahead and the server answers `video_too_long` if needed.
 */
export function readVideoDuration(file: File, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** First image or video file in a DataTransfer (drop), if any. */
export function mediaFromDataTransfer(data: DataTransfer | null): File | null {
  return mediaListFromDataTransfer(data)[0] ?? null;
}

/** Every image or video dropped (the cover's two-photo drop: the first is the cover, the second the article's). */
export function mediaListFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/") || isVideoFile(file));
}

/** "48 seconds", "1 minute 12 seconds". */
export function spokenLength(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes === 0) return part(seconds, "second");
  return seconds === 0 ? part(minutes, "minute") : `${part(minutes, "minute")} ${part(seconds, "second")}`;
}
