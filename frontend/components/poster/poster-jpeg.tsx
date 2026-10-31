"use client";

import { domToBlob } from "modern-screenshot";
import { createRoot } from "react-dom/client";
import { sameOriginMediaUrl } from "@/lib/media-url";
import type { PosterTemplate } from "@/lib/shared/contracts";
import { StoryPoster, type PosterStory } from "./story-poster";

const WIDTH = 360;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The poster's uploads through the site's own `/media/<key>?inline=1` (owner 2026-10-31): R2 doesn't let other sites
 * read its images, so the screenshot got only the blurred placeholder behind the photo. Others: the normal fetch.
 */
async function sameOriginMedia(url: string): Promise<string | false> {
  const local = sameOriginMediaUrl(url);
  if (!local) return false;
  try {
    const response = await fetch(local);
    if (!response.ok) return false;
    return await blobToDataUrl(await response.blob());
  } catch {
    return false;
  }
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll("img")];
  return Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))).then(() => undefined);
}

/**
 * A story's poster, exactly as the feed shows it plus the small WebNEWS mark in its top left corner, as a JPEG
 * (owner 2026-10-05: shares send the poster, not the bare photo; auto-posts use it too). Drawn off screen at 360 px
 * wide × `scale` (3 → 1080 × 1920). A video story shows its poster frame.
 */
export async function posterJpeg(template: PosterTemplate | null | undefined, story: PosterStory, scale = 3): Promise<Blob> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: `${WIDTH}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<StoryPoster template={template} story={{ ...story, videoUrl: null, author: { ...story.author, href: undefined } }} priority mark />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;
    await waitForImages(host);
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error("The poster didn't render");
    // Straight to a Blob: reading a data: URL back with fetch() is blocked by the site's CSP (connect-src 'self'),
    // which made every share fall back to the bare photo (owner 2026-10-05).
    return await domToBlob(node, { scale, quality: 0.9, type: "image/jpeg", backgroundColor: "#ffffff", fetchFn: sameOriginMedia });
  } finally {
    root.unmount();
    host.remove();
  }
}
