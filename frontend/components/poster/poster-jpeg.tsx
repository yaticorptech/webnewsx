"use client";

import { domToBlob } from "modern-screenshot";
import { createRoot } from "react-dom/client";
import type { PosterTemplate } from "@/lib/shared/contracts";
import { StoryPoster, type PosterStory } from "./story-poster";

const WIDTH = 360;

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
    return await domToBlob(node, { scale, quality: 0.9, type: "image/jpeg", backgroundColor: "#ffffff" });
  } finally {
    root.unmount();
    host.remove();
  }
}
