import type { Metadata } from "next";
import { Feed } from "@/components/feed/feed";
import { COMPANY } from "@/lib/company";
import { SITE_DESCRIPTION, SITE_NAME, TAGLINE } from "@/lib/config";
import { absoluteUrl } from "@/lib/utils";
import { NewsFeed } from "@/components/feed/news-feed";
import { FollowingSignedOut } from "@/components/feed/feed-empty";
import { FeedHeader } from "@/components/feed/feed-header";
import { parseHomeTab } from "@/components/feed/feed-views";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { getFeedPage, getTopPublishers } from "@/lib/server-api";
import { newShuffleSeed, visitorShuffleSeed } from "@/lib/shuffle";
import { getSiteViewer } from "@/lib/session";

const SUGGESTED_PUBLISHERS = 5;

/** Home's own canonical and preview (owner 2026-10-22, SEO before hosting); the share image is app/opengraph-image.tsx. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  keywords: ["WebNEWS", "news", "Kannada news", "Karnataka news", "India news", "citizen journalism", "breaking news", "local news"],
  openGraph: { type: "website", url: "/", siteName: SITE_NAME, title: `${SITE_NAME} — ${TAGLINE}`, description: SITE_DESCRIPTION, locale: "en_IN" },
};

/** Who publishes the site, for search engines (schema.org WebSite + NewsMediaOrganization). */
function siteJsonLd() {
  const url = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${url}#website`, url, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: ["en", "kn"], publisher: { "@id": `${url}#org` } },
      {
        "@type": "NewsMediaOrganization",
        "@id": `${url}#org`,
        name: SITE_NAME,
        legalName: COMPANY.legalName,
        url,
        email: COMPANY.email,
        logo: { "@type": "ImageObject", url: absoluteUrl("/icons/icon-512.png"), width: 512, height: 512 },
        sameAs: COMPANY.social.map((network) => network.href),
      },
    ],
  };
}

/**
 * Home (SPEC §3.4 / §3.4b / §3.12) — YouTube-style 16:9 cards, or full-screen 9:16 reels when the visitor picked them
 * with the switch beside Home (owner 2026-10-05: that switch replaced Newsy; lib/feed-layout.ts):
 * every category, newest first; `?tab=following` = reporters you
 * follow (needs an account); `?tab=latest` = newest first (old links; not in the nav). Category pages live
 * at /category/…. The first page is server-rendered for a fast first paint; the client `Feed` takes over
 * for infinite scroll and realtime.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const view = parseHomeTab((await searchParams).tab);
  const tab = view.kind === "tab" ? view.tab : "foryou";
  const [viewer, layout] = await Promise.all([getSiteViewer(), getFeedLayout()]);

  if (tab === "following" && !viewer) {
    return (
      <section aria-labelledby="feed-heading">
        <FeedHeader view={view} />
        <FollowingSignedOut />
      </section>
    );
  }

  const [initialPage, suggestions] = await Promise.all([
    // A fresh mix on every visit (owner 2026-10-05); Following stays newest first. Logged out: the day's mix of
    // recent and older stories, the same all day (owner 2026-10-22; lib/shuffle.ts), so the open cards aren't simply
    // the newest and a refresh can't swap the blurred stories past the free ones into view (owner 2026-10-08).
    getFeedPage({ tab, shuffle: tab === "following" ? null : viewer ? newShuffleSeed() : visitorShuffleSeed() }),
    tab === "following" ? getTopPublishers(SUGGESTED_PUBLISHERS) : Promise.resolve([]),
  ]);

  return (
    <section aria-labelledby="feed-heading">
      {/* Who publishes the site (schema.org), on Home only. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()).replace(/</g, "\\u003c") }} />
      <FeedHeader view={view} />
      {layout === "reel" ? (
        <Feed key={`reel:${tab}`} view={view} initialPage={initialPage} suggestions={suggestions} />
      ) : (
        <NewsFeed key={tab} view={view} initialPage={initialPage} suggestions={suggestions} />
      )}
    </section>
  );
}
