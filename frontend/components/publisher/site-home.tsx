import type { ArticleCard, SiteAdsByPosition } from "@/lib/shared/contracts";
import { AdSlot } from "./ad-slot";
import { FeatureList, GridCard, HeadlineRow, LeadStory, SpotlightRow, StoryLink, relativeTime, type StoryHref } from "./site-parts";
import { WeatherWidget } from "./weather-widget";

type SiteHomeBodyProps = {
  latest: ArticleCard[];
  trending: ArticleCard[];
  breaking: ArticleCard[];
  ads: SiteAdsByPosition;
  city: string | null;
  href: StoryHref;
  preview?: boolean;
};

/**
 * The webnews.in home page (its app/[lang]/page.tsx, without astro — owner 2026-10-29) dealt from one publisher's
 * stories: the hero (headlines · breaking lead · headlines, with the hero ads), a spotlight row, the mid-page banner,
 * a feature with Most Read, Trending with its two ads and the weather card, then everything else in a grid. Sections
 * with no stories left are skipped (no empty boxes).
 */
export function SiteHomeBody({ latest, trending, breaking, ads, city, href, preview = false }: SiteHomeBodyProps) {
  const used = new Set<string>();
  const take = (cards: ArticleCard[], n: number) => {
    const picked: ArticleCard[] = [];
    for (const card of cards) {
      if (picked.length >= n) break;
      if (used.has(card.id)) continue;
      used.add(card.id);
      picked.push(card);
    }
    return picked;
  };

  const lead = take([...breaking, ...latest], 1)[0];
  const left = take(latest, 5);
  const right = take(latest, 4);
  const centre = take(latest, 4);
  const spotlight = take(latest, 4);
  const feature = take(latest, 1)[0];
  const mostRead = take([...trending, ...latest], 7);
  const trendingList = (trending.length ? trending : latest).slice(0, 8);
  const rest = latest.filter((card) => !used.has(card.id));

  if (!lead) {
    return (
      <p className="py-24 text-center text-gray-500">
        {preview ? "Your published stories will appear here." : "Stories are on their way — check back soon."}
      </p>
    );
  }

  return (
    <>
      <section className="mt-6 grid grid-cols-1 gap-y-8 border-y border-gray-200 py-6 lg:grid-cols-12">
        <div className="order-2 flex flex-col lg:order-none lg:col-span-3 lg:border-r lg:border-gray-200 lg:pr-8">
          <div className="flex flex-1 flex-col gap-5">
            {left.map((card) => (
              <HeadlineRow key={card.id} card={card} href={href} withExcerpt />
            ))}
          </div>
          <AdSlot position="hero-left" ads={ads} preview={preview} className="mt-6" />
        </div>

        <div className="order-1 lg:order-none lg:col-span-6 lg:border-r lg:border-gray-200 lg:px-8">
          <LeadStory card={lead} href={href} />
          {centre.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <h2 className="pub-section-head">More Headlines</h2>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {centre.map((card) => (
                  <HeadlineRow key={card.id} card={card} href={href} withExcerpt />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="order-3 flex flex-col lg:order-none lg:col-span-3 lg:pl-8">
          <div className="flex flex-1 flex-col gap-5">
            {right.map((card, i) => (
              <HeadlineRow key={card.id} card={card} href={href} withExcerpt={i < 2} />
            ))}
          </div>
          <AdSlot position="hero-right" ads={ads} preview={preview} className="mt-6" />
        </div>
      </section>

      <SpotlightRow title="Latest Stories" cards={spotlight} href={href} />

      <AdSlot position="mid-page" ads={ads} preview={preview} className="mx-auto mt-10 w-full max-w-[720px]" />

      {feature && <FeatureList feature={feature} list={mostRead} href={href} />}

      <section id="trending" className="scroll-mt-16 mt-12 grid grid-cols-1 gap-8 border-t border-gray-200 pt-6 lg:grid-cols-3">
        <div className="flex flex-col lg:col-span-2">
          <h2 className="pub-section-head order-2 lg:order-1">Trending</h2>
          <ol className="order-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:order-2">
            {trendingList.map((card, i) => (
              <li key={card.id} className="flex items-start gap-3 border-b border-gray-100 pb-3">
                <span className="w-9 shrink-0 font-pub-head text-2xl font-bold leading-none text-pub">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <StoryLink card={card} href={href} className="font-pub-head font-semibold leading-snug text-pub-ink hover:text-pub">
                    {card.title}
                  </StoryLink>
                  <div className="mt-0.5 text-xs text-gray-400">{relativeTime(card.publishedAt)}</div>
                </div>
              </li>
            ))}
          </ol>
          <AdSlot position="newsletter-left" ads={ads} preview={preview} className="order-1 mb-8 lg:order-3 lg:mb-0 lg:mt-8" />
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-6">
          <AdSlot position="trending-sidebar" ads={ads} preview={preview} />
          <WeatherWidget city={city} />
        </div>
      </section>

      {rest.length > 0 && (
        <section id="more-news" className="scroll-mt-16 mt-12 border-t border-gray-200 pt-6">
          <h2 className="pub-section-head">More News</h2>
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((card) => (
              <GridCard key={card.id} card={card} href={href} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
