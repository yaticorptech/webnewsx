import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { MarketView } from "@/components/market/market-view";
import { getMarket } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Market",
  description: "Live Nifty 50, Sensex, Bank Nifty, gold and silver rates, crude oil, the rupee and Bitcoin.",
  alternates: { canonical: "/market" },
  keywords: ["Nifty 50", "Sensex", "Bank Nifty", "gold rate today", "silver rate", "USD to INR", "Bitcoin price INR", "stock market live", "WebNEWS"],
  openGraph: { images: ["/opengraph-image"], type: "website", siteName: "WebNEWS", locale: "en_IN", url: "/market", title: "Market — live Nifty, Sensex, gold and the rupee", description: "Live Nifty 50, Sensex, Bank Nifty, gold and silver rates, crude oil, the rupee and Bitcoin." },
};

/**
 * /market (owner 2026-10-22): the live market numbers next to Home — indices, gold and silver, crude, the rupee,
 * Bitcoin — server-rendered from `GET /api/market`, then refreshed on the client every minute. Full width like the
 * grids (data-grid-page). Ends with the site footer.
 */
export default async function MarketPage() {
  const initial = await getMarket();
  return (
    <section aria-labelledby="market-heading" data-grid-page="">
      <MarketView initial={initial} />
      <SiteFooter className="mt-10 rounded-2xl border" />
    </section>
  );
}
