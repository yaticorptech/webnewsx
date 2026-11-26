import type { Metadata } from "next";

/**
 * A publisher site (e.g. webnews.in) is its own brand: replace the WebNewsX values the root layout sets for every page —
 * app name, home-screen title, Twitter card text, the WebNewsX manifest and WebNewsX's Google verification tag.
 * Without this, webnews.in carried "WebNewsX — Pulse of People" in its tags and Google offered it for "webnewsx"
 * searches (owner 2026-11-26: "only webnews.in comes first … i need webnewsx"). The "Powered by WebNewsX" link stays.
 */
export function publisherSiteMetadata(site: { title: string; tagline?: string | null }): Metadata {
  return {
    applicationName: site.title,
    appleWebApp: { capable: true, title: site.title, statusBarStyle: "default" },
    twitter: { card: "summary_large_image", title: site.title, description: site.tagline ?? `${site.title}: the latest news.` },
    manifest: null,
    verification: {},
  };
}
