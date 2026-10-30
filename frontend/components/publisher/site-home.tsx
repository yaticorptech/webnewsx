import type { ArticleCard, Category, SiteAdsByPosition, SiteLanguage, SiteSection } from "@/lib/shared/contracts";
import { AdSlot } from "./ad-slot";
import { categoryName, tr } from "./site-i18n";
import { FeatureList, HeadlineRow, LeadStory, SpotlightRow, StoryLink, relativeTime, type StoryHref } from "./site-parts";
import { WeatherWidget } from "./weather-widget";

type SiteHomeBodyProps = {
  latest: ArticleCard[];
  trending: ArticleCard[];
  breaking: ArticleCard[];
  /** A row per menu category (Home only; a category page passes none). */
  sections: SiteSection[];
  ads: SiteAdsByPosition;
  city: string | null;
  href: StoryHref;
  /** A section's "See all" page; null in the setup preview (nowhere to go). */
  categoryHref: ((category: Category) => string) | null;
  /** The mail link the red "Advertise with us" band books through; null in the preview. */
  bookHref: string | null;
  lang: SiteLanguage;
  preview?: boolean;
};

/**
 * The webnews.in home page (its app/[lang]/page.tsx — owner 2026-10-30: "same exact copy", no astrology, no PeopleHub)
 * dealt from one publisher's stories, in its order: the hero (headlines · breaking lead · headlines, with the hero ads),
 * a spotlight row per menu category with "See all", the mid-page banner, the feature with Most Read, Trending with its
 * two ads and the weather card, then the red "Advertise with us" band. Sections with no stories left are skipped.
 */
export function SiteHomeBody({ latest, trending, breaking, sections, ads, city, href, categoryHref, bookHref, lang, preview = false }: SiteHomeBodyProps) {
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
  // Category rows may repeat a hero story (webnews.in's section fronts do): each row is that section's latest.
  const rows = sections.filter((section) => section.stories.length > 0);
  const latestRow = rows.length === 0 ? take(latest, 4) : [];
  const feature = take(latest, 1)[0];
  const mostRead = take([...trending, ...latest], 7);
  const trendingList = (trending.length ? trending : latest).slice(0, 8);

  if (!lead) {
    return <p className="py-24 text-center text-gray-500">{tr(lang, preview ? "previewEmpty" : "noStories")}</p>;
  }

  return (
    <>
      <section className="mt-6 grid grid-cols-1 gap-y-8 border-y border-gray-200 py-6 lg:grid-cols-12">
        <div className="order-2 flex flex-col lg:order-none lg:col-span-3 lg:border-r lg:border-gray-200 lg:pr-8">
          <div className="flex flex-1 flex-col gap-5">
            {left.map((card) => (
              <HeadlineRow key={card.id} card={card} href={href} withExcerpt lang={lang} />
            ))}
          </div>
          <AdSlot position="hero-left" ads={ads} preview={preview} className="mt-6" />
        </div>

        <div className="order-1 lg:order-none lg:col-span-6 lg:border-r lg:border-gray-200 lg:px-8">
          <LeadStory card={lead} href={href} lang={lang} />
          {centre.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <h2 className="pub-section-head">{tr(lang, "moreHeadlines")}</h2>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {centre.map((card) => (
                  <HeadlineRow key={card.id} card={card} href={href} withExcerpt lang={lang} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="order-3 flex flex-col lg:order-none lg:col-span-3 lg:pl-8">
          <div className="flex flex-1 flex-col gap-5">
            {right.map((card, i) => (
              <HeadlineRow key={card.id} card={card} href={href} withExcerpt={i < 2} lang={lang} />
            ))}
          </div>
          <AdSlot position="hero-right" ads={ads} preview={preview} className="mt-6" />
        </div>
      </section>

      {rows.map((section) => (
        <SpotlightRow
          key={section.category}
          title={categoryName(section.category, lang)}
          seeAll={categoryHref ? categoryHref(section.category) : undefined}
          cards={section.stories}
          href={href}
          lang={lang}
        />
      ))}
      {latestRow.length > 0 && <SpotlightRow title={tr(lang, "latestStories")} cards={latestRow} href={href} lang={lang} />}

      <AdSlot position="mid-page" ads={ads} preview={preview} className="mx-auto mt-10 w-full max-w-[720px]" />

      {feature && <FeatureList feature={feature} list={mostRead} href={href} lang={lang} />}

      <section id="trending" className="scroll-mt-16 mt-12 grid grid-cols-1 gap-8 border-t border-gray-200 pt-6 lg:grid-cols-3">
        <div className="flex flex-col lg:col-span-2">
          <h2 className="pub-section-head order-2 lg:order-1">{tr(lang, "trending")}</h2>
          <ol className="order-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:order-2">
            {trendingList.map((card, i) => (
              <li key={card.id} className="flex items-start gap-3 border-b border-gray-100 pb-3">
                <span className="w-9 shrink-0 font-pub-head text-2xl font-bold leading-none text-pub">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <StoryLink card={card} href={href} className="font-pub-head font-semibold leading-snug text-pub-ink hover:text-pub">
                    {card.title}
                  </StoryLink>
                  <div className="mt-0.5 text-xs text-gray-400">{relativeTime(card.publishedAt, lang)}</div>
                </div>
              </li>
            ))}
          </ol>
          <AdSlot position="newsletter-left" ads={ads} preview={preview} className="order-1 mb-8 lg:order-3 lg:mb-0 lg:mt-8" />
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-6">
          <AdSlot position="trending-sidebar" ads={ads} preview={preview} />
          <WeatherWidget city={city} lang={lang} />
        </div>
      </section>

      <section className="mt-10 overflow-hidden rounded-lg bg-pub">
        <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{lang === "kn" ? "ಜಾಹೀರಾತು" : "Advertise with us"}</p>
            <h3 className="mt-1 font-pub-head text-2xl font-bold leading-tight">
              {lang === "kn" ? "ನಿಮ್ಮ ಬ್ರ್ಯಾಂಡ್ ಅನ್ನು ನಮ್ಮ ಓದುಗರಿಗೆ ತಲುಪಿಸಿ" : "Reach our readers"}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-white/80">
              {lang === "kn"
                ? "ಚಿತ್ರ ಅಥವಾ ವೀಡಿಯೊ ಜಾಹೀರಾತುಗಳು — ಗಂಟೆ ಅಥವಾ ದಿನದ ಸ್ಲಾಟ್‌ಗಳು."
                : "Image or video ads, booked by the hour or the day, on every page of this site."}
            </p>
          </div>
          {bookHref ? (
            <a href={bookHref} className="shrink-0 rounded-md bg-white px-6 py-2.5 text-sm font-semibold text-pub hover:bg-gray-100">
              {lang === "kn" ? "ಸಂಪರ್ಕಿಸಿ" : "Get in touch"}
            </a>
          ) : (
            <span className="shrink-0 rounded-md bg-white px-6 py-2.5 text-sm font-semibold text-pub">{lang === "kn" ? "ಸಂಪರ್ಕಿಸಿ" : "Get in touch"}</span>
          )}
        </div>
      </section>
    </>
  );
}
