import { TrendingCard } from "@/components/feed/trending-card";
import { SiteFooter } from "./site-footer";

/**
 * Desktop (≥1280px) sticky right column beside the feeds — grid and reels (redesign 2026-10-07, like Facebook):
 * Trending now and WebNEWS's social icons (owner 2026-10-07: no "Reporters to follow").
 */
export function RightRail() {
  return (
    <aside aria-label="Trending and suggestions" className="sticky top-below-nav hidden w-80 shrink-0 self-start xl:block">
      {/* Cards must not shrink to fit: when the rail is taller than the viewport it scrolls instead of clipping them. */}
      <div className="no-scrollbar flex max-h-[calc(100dvh-var(--nav-h)-2rem)] flex-col gap-4 overflow-y-auto overscroll-contain pb-8 *:shrink-0">
        <TrendingCard />
        <SiteFooter variant="compact" className="pt-1" />
      </div>
    </aside>
  );
}
