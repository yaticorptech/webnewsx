import type { Metadata } from "next";
import { TrendingList } from "@/components/feed/trending-list";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_NAME, TRENDING_PAGE_SIZE } from "@/lib/config";
import { getTrendingPage } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Trending",
  description: `The most read, liked and shared stories on ${SITE_NAME} in the last 24 hours.`,
  alternates: { canonical: "/trending" },
};

/**
 * /trending (SPEC §3.1, §3.4b): the top stories of the last 24 hours as a ranked list in the feed's
 * reading column — reached from the "Trending now" card's "See all". Server-rendered from
 * `GET /api/feed/trending?limit=20`, then kept live on the client. Ends with the site footer.
 */
export default async function TrendingPage() {
  const initial = await getTrendingPage(TRENDING_PAGE_SIZE);
  return (
    <section aria-labelledby="trending-heading">
      <TrendingList initial={initial} />
      <SiteFooter className="mt-10 rounded-2xl border" />
    </section>
  );
}
