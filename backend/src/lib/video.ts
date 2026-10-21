import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { LIMITS } from "../shared/contracts.js";
import { ApiError } from "./errors.js";
import { processImage, type ProcessedImage } from "./images.js";

/*
 * Story videos (owner rule 2026-09-25): at most LIMITS.videoMaxSeconds. A longer clip is refused
 * (422 `video_too_long`) unless the uploader chose to keep only its first 30 seconds (`trim`).
 * Every clip is re-encoded with ffmpeg (bundled by `ffmpeg-static`) into one format every browser plays:
 * H.264 + AAC MP4, longest side ≤ 1280 px, ≤ 30 fps, metadata (e.g. phone GPS) stripped, `faststart` so
 * playback begins before the whole file arrives. A frame near the start becomes the poster, processed like
 * a cover image — every thumbnail surface keeps using the cover fields.
 */

const MAX_MS = LIMITS.videoMaxSeconds * 1000;
/** Container durations are often a few frames over a round number (a "30 s" phone clip reads 30.03 s). */
const DURATION_TOLERANCE_MS = 500;
const MIN_MS = 1000;
const MAX_EDGE = 1280;
const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000;
/** Encodes are CPU-heavy: at most this many run at once, the rest wait their turn. */
const MAX_PARALLEL = 2;

export type ProcessedVideo = {
  buffer: Buffer;
  width: number;
  height: number;
  durationMs: number;
  originalDurationMs: number;
  trimmed: boolean;
  poster: ProcessedImage;
};

/** Path of the ffmpeg binary bundled by `ffmpeg-static` (a CommonJS package exporting the path string; null if unsupported). */
const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as string | null;

type Probe = { durationMs: number | null; width: number | null; height: number | null; hasVideo: boolean };

function binary(): string {
  if (!ffmpegPath) throw new ApiError(503, "video_unavailable", "Video uploads aren't available on this server yet");
  return ffmpegPath;
}

/** Runs ffmpeg and resolves with its stderr (ffmpeg reports everything there) and exit code. */
function run(args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      // Keep the tail only: progress lines would otherwise grow without bound.
      stderr = (stderr + chunk).slice(-64_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

function parseClock(value: string): number {
  const [h, m, s] = value.split(":").map(Number);
  return Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000);
}

/** Reads duration and picture size from `ffmpeg -i` (it exits non-zero without an output — that's expected). */
export async function probeVideo(path: string): Promise<Probe> {
  const { stderr } = await run(["-i", path]);
  const duration = /Duration: (\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(stderr);
  const stream = /Stream #\d+:\d+[^\n]*: Video: [^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  let durationMs = duration?.[1] ? parseClock(duration[1]) : null;
  if (durationMs === null && stream) {
    // Some WebM files carry no container duration: decode (without writing anything) and read the last timestamp.
    const decoded = await run(["-i", path, "-map", "0:v:0", "-f", "null", "-"]);
    const times = [...decoded.stderr.matchAll(/time=(\d+:\d{2}:\d{2}(?:\.\d+)?)/g)];
    const last = times.at(-1)?.[1];
    durationMs = last ? parseClock(last) : null;
  }
  return {
    durationMs,
    width: stream?.[1] ? Number(stream[1]) : null,
    height: stream?.[2] ? Number(stream[2]) : null,
    hasVideo: Boolean(stream),
  };
}

export function secondsLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Longest side ≤ 1280 px, even dimensions (H.264 4:2:0 needs them), square pixels. */
const SCALE_FILTER = [
  `scale=w='if(gte(iw,ih),min(${MAX_EDGE},iw),-2)':h='if(gte(iw,ih),-2,min(${MAX_EDGE},ih))'`,
  "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  "setsar=1",
].join(",");

/**
 * Validates and re-encodes an uploaded video. `trim` = keep only the first LIMITS.videoMaxSeconds of a longer clip.
 * Throws 422 `video_too_long` (with the length in the message), `video_too_short` or `invalid_video`.
 */
export async function processVideo(file: File, options: { trim: boolean }): Promise<ProcessedVideo> {
  const dir = await mkdtemp(join(tmpdir(), "webnews-video-"));
  try {
    const input = join(dir, "input");
    await pipeline(Readable.fromWeb(file.stream() as unknown as WebReadableStream<Uint8Array>), createWriteStream(input));

    const probe = await probeVideo(input);
    if (!probe.hasVideo || probe.durationMs === null) {
      throw new ApiError(415, "invalid_video", "We couldn't read this video. Try an MP4, MOV or WebM file.");
    }
    const originalDurationMs = probe.durationMs;
    if (originalDurationMs < MIN_MS) throw new ApiError(422, "video_too_short", "Videos must be at least 1 second long");
    const tooLong = originalDurationMs > MAX_MS + DURATION_TOLERANCE_MS;
    if (tooLong && !options.trim) {
      throw new ApiError(
        422,
        "video_too_long",
        `Videos can be ${LIMITS.videoMaxSeconds} seconds at most. This one is ${secondsLabel(originalDurationMs)}.`,
      );
    }

    return await withSlot(async () => {
      const output = join(dir, "video.mp4");
      const encoded = await run([
        "-i", input,
        ...(tooLong ? ["-t", String(LIMITS.videoMaxSeconds)] : []),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-map_metadata", "-1",
        "-vf", SCALE_FILTER,
        "-fpsmax", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "1024",
        "-y", output,
      ]);
      if (encoded.code !== 0) {
        console.warn("[video] encode failed:", encoded.stderr.split("\n").slice(-6).join(" | "));
        throw new ApiError(422, "invalid_video", "We couldn't process this video. Try another file.");
      }
      const result = await probeVideo(output);
      if (!result.width || !result.height || result.durationMs === null) {
        throw new ApiError(422, "invalid_video", "We couldn't process this video. Try another file.");
      }

      const posterPath = join(dir, "poster.png");
      const at = Math.min(0.5, result.durationMs / 2000);
      const frame = await run(["-ss", at.toFixed(2), "-i", output, "-frames:v", "1", "-y", posterPath]);
      if (frame.code !== 0) throw new ApiError(422, "invalid_video", "We couldn't process this video. Try another file.");
      const poster = await processImage(await readFile(posterPath), "cover");

      return {
        buffer: await readFile(output),
        width: result.width,
        height: result.height,
        durationMs: Math.min(result.durationMs, MAX_MS + DURATION_TOLERANCE_MS),
        originalDurationMs,
        trimmed: tooLong,
        poster,
      };
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A 90-minute press meet recording can take a while to encode. */
const RECORDING_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Press meet recordings (owner 2026-10-01): the browser's WebM / MP4 pieces, joined, become one H.264 + AAC MP4 with
 * `faststart` (seekable, plays everywhere). Returns its length, or null when ffmpeg couldn't read the input.
 */
export async function transcodeRecording(input: string, output: string): Promise<{ durationMs: number } | null> {
  return withSlot(async () => {
    const encoded = await run(
      [
        "-fflags", "+genpts",
        "-i", input,
        "-map", "0:v:0?", "-map", "0:a:0?",
        "-map_metadata", "-1",
        "-vf", SCALE_FILTER,
        "-fpsmax", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-ar", "48000",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "4096",
        "-y", output,
      ],
      RECORDING_TIMEOUT_MS,
    );
    if (encoded.code !== 0) {
      console.warn("[recording] encode failed:", encoded.stderr.split("\n").slice(-6).join(" | "));
      return null;
    }
    const probe = await probeVideo(output);
    return { durationMs: probe.durationMs ?? 0 };
  });
}
