/*
 * Browser-only helpers for the cover picker: file checks and rendering the chosen 9:16 crop to a
 * JPEG blob (the backend re-encodes to WebP inside 1600×1600, so this only needs to be good enough).
 */

export type PixelArea = { x: number; y: number; width: number; height: number };

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

/** Originals are decoded locally and re-encoded before upload, so they may exceed the 8 MB upload cap. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Crops are rendered at most this long on their longest side (the backend stores ≤ 1600 px). */
const MAX_OUTPUT_EDGE = 2400;

export type FileProblem = { title: string; description: string };

export function checkImageFile(file: File): FileProblem | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { title: "That file type isn't supported", description: "Use a JPG, PNG, WebP, GIF or AVIF image." };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { title: "That image is too large", description: "Choose an image under 25 MB." };
  }
  return null;
}

/** First image file in a DataTransfer (drop or paste), if any. */
export function imageFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) if (file.type.startsWith("image/")) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export function dataTransferHasFiles(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types).includes("Files"));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("We couldn't read that image."));
    image.src = src;
  });
}

/** Makes sure the browser can decode the file before the crop dialog opens. */
export async function assertDecodable(src: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(src);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("We couldn't read that image.");
  return { width: image.naturalWidth, height: image.naturalHeight };
}

/** Renders `area` (natural pixels) of `src` into a JPEG blob. */
export async function cropToBlob(src: string, area: PixelArea): Promise<Blob> {
  const image = await loadImage(src);
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(area.width, area.height));
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't crop this image.");
  // Transparent PNGs become JPEGs: give them a white backdrop instead of black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Your browser couldn't crop this image."))),
      "image/jpeg",
      0.9,
    );
  });
}
