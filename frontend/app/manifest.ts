import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, TAGLINE, THEME_COLOR } from "@/lib/config";

/** Web app manifest (served at /manifest.webmanifest). Icons are owner-supplied — never regenerate. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ["news", "social"],
    icons: [
      { src: "/brand/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
