import type { Area } from "react-easy-crop";

/** Output edge in px (the backend stores avatars as 512×512 WebP). */
export const AVATAR_OUTPUT_SIZE = 512;
/** Originals are re-encoded in the browser, so they may be larger than the 8 MB upload cap. */
export const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

const ACCEPTED_TYPES = new Set(AVATAR_ACCEPT.split(","));

/** Friendly reason why a picked file can't be used, or null when it looks fine. */
export function avatarFileProblem(file: File): string | null {
  if (file.type && !ACCEPTED_TYPES.has(file.type)) {
    return file.type.startsWith("image/")
      ? "That image format isn't supported. Use a JPG, PNG, WebP, GIF or AVIF."
      : "That file isn't an image. Choose a JPG, PNG, WebP, GIF or AVIF.";
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) return "That photo is over 25 MB. Choose a smaller one.";
  return null;
}

/** Decodes an image URL (object URL) — rejects when the browser can't read it. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Renders the selected crop (react-easy-crop `croppedAreaPixels`, in the rotated image's
 * coordinate space) straight into a 512×512 canvas — no full-size intermediate canvas, so very
 * large phone photos stay within mobile canvas limits. Returns WebP (PNG where WebP encoding
 * isn't available) so transparency survives.
 */
export async function cropToAvatarBlob(src: string, area: Area, rotation = 0): Promise<Blob> {
  const image = await loadImage(src);
  const size = AVATAR_OUTPUT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images here.");

  const radians = (rotation * Math.PI) / 180;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const boxWidth = Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height);
  const boxHeight = Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(size / area.width, size / area.height);
  ctx.translate(-area.x, -area.y);
  ctx.translate(boxWidth / 2, boxHeight / 2);
  ctx.rotate(radians);
  ctx.translate(-width / 2, -height / 2);
  ctx.drawImage(image, 0, 0);

  const webp = await toBlob(canvas, "image/webp", 0.92);
  if (webp && webp.type === "image/webp") return webp;
  const png = await toBlob(canvas, "image/png");
  if (!png) throw new Error("Couldn't prepare your photo. Try another image.");
  return png;
}
