import type { ArticleCard, Headline } from "@/lib/shared/contracts";

/** An undecodable image (exercises the avatar fallback without a 404 in the console). */
export const BROKEN_IMAGE = "data:image/png;base64,AAAA";

/** Fixed timestamps keep server and client markup identical (relative labels render after mount). */
export const DEMO_HEADLINES: Headline[] = [
  { id: "d1", slug: "demo-city-council", title: "City council approves 24-hour transit pilot for the riverside line", publishedAt: "2026-09-24T06:48:00Z", author: { username: "maya.reports" } },
  { id: "d2", slug: "demo-heatwave", title: "Record September heat pushes the power grid to its limit", publishedAt: "2026-09-24T06:21:00Z", author: { username: "grid.watch" } },
  { id: "d3", slug: "demo-startups", title: "Three local founders on building without venture money", publishedAt: "2026-09-24T05:47:00Z", author: { username: "ada.writes" } },
  { id: "d4", slug: "demo-football", title: "Late equaliser keeps the title race wide open", publishedAt: "2026-09-24T03:15:00Z", author: { username: "matchday" } },
  { id: "d5", slug: "demo-library", title: "The neighbourhood library that never closes", publishedAt: "2026-09-23T21:02:00Z", author: { username: "maya.reports" } },
];

const TITLES = [
  "Night buses return to the harbour district after a six-year pause",
  "Volunteers map every tree in the old quarter — all 11,000 of them",
  "Why the new stadium roof keeps making noise at night",
  "Rain delays the marathon, but not the crowds",
];

let counter = 0;

/** A fresh fake ArticleCard for simulating `article.published` locally. */
export function makeDemoCard(): ArticleCard {
  counter += 1;
  const title = TITLES[counter % TITLES.length]!;
  return {
    id: `demo-live-${Date.now()}-${counter}`,
    slug: `demo-live-${counter}`,
    title,
    excerpt: "Simulated realtime story from the style guide.",
    coverUrl: "/icons/icon-512.png",
    coverWidth: 512,
    coverHeight: 512,
    coverBlur: null,
    linkUrl: null,
    linkDomain: null,
    readingMinutes: 3,
    viewCount: 0,
    likeCount: 0,
    shareCount: 0,
    commentCount: 0,
    publishedAt: new Date().toISOString(),
    author: { id: "u1", username: "maya.reports", name: "Maya Okafor", image: null },
    viewer: { liked: false, followingAuthor: false, isAuthor: false },
  };
}
