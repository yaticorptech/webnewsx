import { ApiError } from "./errors.js";
import { processImage } from "./images.js";
import { newImageKey, storage } from "./storage.js";

const GOOGLE_AVATAR_TIMEOUT_MS = 5_000;
const GOOGLE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Only Google profile photo hosts may be fetched server-side (SSRF guard). */
export function isGoogleAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"));
  } catch {
    return false;
  }
}

const invalidImage = () =>
  new ApiError(400, "validation_error", "Please upload a profile photo", { image: "Please upload a profile photo" });

/**
 * Turns the `image` sent by onboarding / profile edit into a URL we host:
 * - one of the user's own uploaded avatars → kept as is;
 * - a Google profile photo → downloaded (5s, 5MB), processed and re-hosted;
 * - anything else → 400.
 */
export async function resolveAvatarImage(image: string, userId: string, currentImage: string | null): Promise<string> {
  if (currentImage && image === currentImage && storage.keyFromUrl(image)) return image;
  const key = storage.keyFromUrl(image);
  if (key) {
    if (!key.startsWith(`avatars/${userId}/`)) throw invalidImage();
    return storage.urlFor(key);
  }
  if (isGoogleAvatarUrl(image)) return rehostGoogleAvatar(image, userId);
  throw invalidImage();
}

/** Google photo URLs end with a size directive such as `=s96-c`; ask for a 512px square instead. */
export function largeGoogleAvatarUrl(value: string): string {
  return /=s\d+(-c)?$/.test(value) ? value.replace(/=s\d+(-c)?$/, "=s512-c") : value;
}

const MAX_REDIRECTS = 3;

/** GET with manual redirects that must stay on Google's photo hosts (SSRF guard), 5s total. */
async function fetchGoogleAvatar(url: string): Promise<Response> {
  const signal = AbortSignal.timeout(GOOGLE_AVATAR_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isGoogleAvatarUrl(current)) throw new Error("redirected off Google");
    const response = await fetch(current, { redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error("too many redirects");
}

async function rehostGoogleAvatar(url: string, userId: string): Promise<string> {
  let bytes: Buffer;
  try {
    const response = await fetchGoogleAvatar(largeGoogleAvatarUrl(url));
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > GOOGLE_AVATAR_MAX_BYTES) throw new Error("too large");
    bytes = await readCapped(response.body, GOOGLE_AVATAR_MAX_BYTES);
  } catch {
    throw new ApiError(422, "avatar_fetch_failed", "We couldn't import your Google photo. Please upload one instead.", {
      image: "Please upload a profile photo",
    });
  }
  const processed = await processImage(bytes, "avatar");
  const key = newImageKey("avatar", userId);
  return storage.put(key, processed.buffer, processed.contentType);
}

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error("too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
