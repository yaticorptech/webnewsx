import sharp from "sharp";
import { ApiError } from "./errors.js";

/**
 * `article`: the full article's image (owner 2026-09-29: any size or shape) — processed like a cover, no shape limit.
 * `frame`: a reporter's own poster frame (owner 2026-10-08) — processed like a cover; any image is allowed (owner: no
 * transparency required), and see-through parts, when it has them, are kept (webp keeps the alpha channel).
 */
export type ImageKind = "avatar" | "cover" | "article" | "frame";

export type ProcessedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
  blurDataUrl: string;
};

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);
/**
 * Decompression-bomb guard. The web app always uploads its own crops (covers ≤ 2400 px wide, avatars 512 px),
 * so 25 MP (e.g. 6000×4000) leaves plenty of room for direct uploads while bounding decode time.
 */
const MAX_INPUT_PIXELS = 25_000_000;
const AVATAR_SIZE = 512;
/** Covers fit inside 1600×1600 (a 9:16 crop → 900×1600; older 16:9 ones → 1600×900) — width AND height are capped. */
const COVER_MAX_EDGE = 1600;
/** Longest side ÷ shortest side (not for article images). A 1:10 strip is a CPU/storage trap, not a cover. */
const MAX_ASPECT_RATIO = 4;
const QUALITY = 82;

sharp.cache(false);

/**
 * Decodes an uploaded image with sharp (never trusting the declared mime type) and re-encodes it:
 * EXIF-rotated, metadata stripped, avatar → 512×512 cover crop, cover → inside 1600×1600; both webp q82,
 * plus a 16px-wide blurred webp data URL placeholder. Inputs over 25 MP, or avatars / covers longer than 4:1, are refused.
 * Article images (`article`) are processed like covers but may be any shape.
 */
export async function processImage(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  let format: string | undefined;
  let size: { width: number; height: number };
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
    format = meta.format;
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    size = { width: meta.width, height: meta.height };
  } catch {
    throw new ApiError(415, "unsupported_image", "That file isn't a supported image (JPEG, PNG, WebP, GIF or AVIF, up to 25 megapixels)");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ApiError(415, "unsupported_image", "That file isn't a supported image (JPEG, PNG, WebP, GIF or AVIF)");
  }
  if (kind !== "article" && Math.max(size.width, size.height) / Math.min(size.width, size.height) > MAX_ASPECT_RATIO) {
    throw new ApiError(422, "image_aspect_ratio", "That image is too long and thin. Use a regular photo (at most 4:1).");
  }

  try {
    // animated: false → first frame only for GIF/animated WebP.
    const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false }).rotate();
    const pipeline =
      kind === "avatar"
        ? base.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
        : base.resize({ width: COVER_MAX_EDGE, height: COVER_MAX_EDGE, fit: "inside", withoutEnlargement: true });
    const { data, info } = await pipeline.webp({ quality: QUALITY }).toBuffer({ resolveWithObject: true });
    const blurDataUrl = await makeBlurDataUrl(data);
    return { buffer: data, width: info.width, height: info.height, contentType: "image/webp", blurDataUrl };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "image_processing_failed", "We couldn't process that image. Try another one.");
  }
}

/** 16px-wide webp placeholder as a base64 data URL (~200–400 bytes). */
export async function makeBlurDataUrl(image: Buffer): Promise<string> {
  const tiny = await sharp(image).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${tiny.toString("base64")}`;
}
