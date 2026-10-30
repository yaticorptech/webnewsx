import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/publisher/site-chrome";
import { SiteHomeBody } from "@/components/publisher/site-home";
import { siteBookHref, siteCategoryHref } from "@/components/publisher/site-i18n";
import { siteLanguageFor } from "@/components/publisher/site-language";
import { getSiteHome } from "@/lib/server-api";

type Props = { params: Promise<{ domain: string }> };

/** Fresh on every visit: new stories and ads show at once. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const home = await getSiteHome(decodeURIComponent((await params).domain));
  if (!home) return { title: "Not found", robots: { index: false } };
  const { site } = home;
  return {
    title: { absolute: site.tagline ? `${site.title} — ${site.tagline}` : site.title },
    description: site.tagline ?? `${site.title}: the latest news.`,
    alternates: { canonical: `https://${site.domain}/` },
    openGraph: { siteName: site.title, title: site.title, description: site.tagline ?? undefined, images: site.logoUrl ? [site.logoUrl] : undefined },
    icons: site.logoUrl ? { icon: site.logoUrl } : undefined,
  };
}

/**
 * A publisher's website (owner 2026-10-29): served on their verified domain (proxy.ts rewrites `<domain>/` here) in the
 * webnews.in layout, with only their stories; each opens on WebNEWS so its views count there.
 */
export default async function PublisherHome({ params }: Props) {
  const home = await getSiteHome(decodeURIComponent((await params).domain));
  if (!home) notFound();
  const { site } = home;
  const lang = await siteLanguageFor(site);
  const ticker = [...home.breaking, ...home.latest.filter((c) => !home.breaking.some((b) => b.id === c.id))].slice(0, 8);
  return (
    <SiteChrome site={site} homeHref="/" ticker={ticker} articleBase={site.articleBase} ads={home.ads} categories={home.categories} lang={lang}>
      <SiteHomeBody
        latest={home.latest}
        trending={home.trending}
        breaking={home.breaking}
        sections={home.sections}
        ads={home.ads}
        city={site.city}
        href={(card) => `${site.articleBase}/${card.slug}`}
        categoryHref={(category) => siteCategoryHref("/", category)}
        bookHref={siteBookHref(site)}
        lang={lang}
      />
    </SiteChrome>
  );
}
