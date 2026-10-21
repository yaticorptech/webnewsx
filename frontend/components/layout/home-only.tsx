"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isFeedPath } from "@/components/feed/feed-views";
import { useFeedLayout } from "@/components/providers/feed-layout-provider";

/**
 * Renders its children only on the feed pages (Home, Following, the categories and languages — grid or reels). Used
 * for the right column (Trending now, Reporters to follow): redesign 2026-10-07 brought it back beside the grid too
 * (before: reels only). Never on profiles, stories, publish, settings or other pages. Works during server rendering
 * too (usePathname is known), so there is no flash. `reelsOnly` (owner 2026-10-16: the YouTube-style grid has no right
 * column): only with the reels layout.
 */
export function HomeOnly({ children, reelsOnly = false }: { children: ReactNode; reelsOnly?: boolean }) {
  const { layout } = useFeedLayout();
  if (!isFeedPath(usePathname())) return null;
  return reelsOnly && layout !== "reel" ? null : children;
}
