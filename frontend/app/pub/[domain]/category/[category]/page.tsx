import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/publisher/site-chrome";
import { SiteHomeBody } from "@/components/publisher/site-home";
import { getSiteHome } from "@/lib/server-api";
import { categoryName, siteBookHref, siteCategoryHref, tr } from "@/components/publisher/site-i18n";
import { siteLanguageFor } from "@/components/publisher/site-language";
import { categoryLabel } from "@/lib/shared/contracts";

type Props = { params: Promise<{ domain: string; category: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, category } = await params;
  const home = await getSiteHome(decodeURIComponent(domain), category);
  if (!home?.category) return { title: "Not found", robots: { index: false } };
  const label = categoryLabel(home.category);
  return {
    title: { absolute: `${label} — ${home.site.title}` },
    description: `${home.site.title}: the latest ${label} news.`,
    alternates: { canonical: `https://${home.site.domain}/category/${home.category}` },
  };
}

/** One menu section of a publisher's site (owner 2026-10-30): `<domain>/category/<category>`, the home layout with its stories only. */
export default async function PublisherCategory({ params }: Props) {
  const { domain, category } = await params;
  const home = await getSiteHome(decodeURIComponent(domain), category);
  if (!home?.category) notFound();
  const { site } = home;
  const lang = await siteLanguageFor(site);
  const label = categoryName(home.category, lang);
  const ticker = home.breaking.length ? home.breaking : home.latest.slice(0, 8);
  return (
    <SiteChrome site={site} homeHref="/" ticker={ticker} articleBase={site.articleBase} ads={home.ads} categories={home.categories} activeCategory={home.category} lang={lang}>
      <h1 className="pub-section-head mt-8">{label}</h1>
      {home.latest.length > 0 ? (
        <SiteHomeBody
          latest={home.latest}
          trending={home.trending}
          breaking={[]}
          sections={[]}
          ads={home.ads}
          city={site.city}
          href={(card) => `${site.articleBase}/${card.slug}`}
          categoryHref={(category) => siteCategoryHref("/", category)}
          bookHref={siteBookHref(site)}
          lang={lang}
        />
      ) : (
        <p className="py-20 text-center text-gray-500">{tr(lang, "noneInSection")}</p>
      )}
    </SiteChrome>
  );
}
