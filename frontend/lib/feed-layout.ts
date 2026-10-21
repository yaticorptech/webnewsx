/*
 * How Home and every category page show stories (owner 2026-10-05: Newsy was removed and became this switch beside
 * Home): "grid" = the YouTube-style 16:9 cards, "reel" = the full-screen 9:16 posters one per swipe. One choice for
 * every feed, kept in a cookie so the server renders the right one first (website, phones and the app alike).
 */
export const FEED_LAYOUT_VALUES = ["grid", "reel"] as const;
export type FeedLayout = (typeof FEED_LAYOUT_VALUES)[number];

export const FEED_LAYOUT_COOKIE = "webnews_feed_layout";
/** A year: it's a lasting preference. */
export const FEED_LAYOUT_MAX_AGE = 60 * 60 * 24 * 365;

export function parseFeedLayout(value: string | null | undefined): FeedLayout {
  return value === "reel" ? "reel" : "grid";
}
