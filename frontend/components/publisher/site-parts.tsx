import type { ReactNode } from "react";
import type { ArticleCard, SiteLanguage } from "@/lib/shared/contracts";
import { categoryName, dateLocale, tr } from "./site-i18n";

/*
 * The webnews.in building blocks (its app/[lang]/page.tsx, components/home/Magazine.tsx, news/ArticleCard.tsx), drawn
 * with a publisher's own stories (owner 2026-10-29). Every story links to `href(card)` — WebNEWS's story page in the
 * same layout, so views count on WebNEWS.
 */

export type StoryHref = (card: ArticleCard) => string;

export const storyImage = (card: ArticleCard) => card.articleImage?.url || card.coverUrl;
export const storyKicker = (card: ArticleCard, lang: SiteLanguage) => (card.category ? categoryName(card.category, lang, card.district) : "");

/** webnews.in's lib/time.ts: "just now", "5 min ago", "3 hours ago" (under 12 h), then the date. */
export function relativeTime(iso: string, lang: SiteLanguage): string {
  const d = new Date(iso);
  const then = d.getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  if (diff >= 0 && min < 1) return tr(lang, "justNow");
  if (diff >= 0 && min < 60) return `${min} ${tr(lang, "minAgo")}`;
  if (diff >= 0 && hr < 12) return lang === "kn" ? `${hr} ${tr(lang, "hAgo")}` : `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** A plain `<a>`: their site and WebNEWS are different origins, so no client-side navigation between them. */
export function StoryLink({ card, href, className, children }: { card: ArticleCard; href: StoryHref; className?: string; children: ReactNode }) {
  return (
    <a href={href(card)} className={className}>
      {children}
    </a>
  );
}

function Picture({ card, className }: { card: ArticleCard; className: string }) {
  const src = storyImage(card);
  return <div className={`bg-gray-100 bg-cover bg-center ${className}`} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

/** Byline line: author · time. */
function Meta({ card, lang }: { card: ArticleCard; lang: SiteLanguage }) {
  return (
    <div className="mt-1 text-xs text-gray-400">
      {card.author.name} · {relativeTime(card.publishedAt, lang)}
    </div>
  );
}

/** A headline with a small square thumbnail (the hero's side columns). */
export function HeadlineRow({ card, href, withExcerpt, lang }: { card: ArticleCard; href: StoryHref; withExcerpt?: boolean; lang: SiteLanguage }) {
  const kicker = storyKicker(card, lang);
  return (
    <div className="flex gap-3 border-b border-gray-100 pb-4 last:border-0">
      <div className="min-w-0 flex-1">
        {kicker && <div className="pub-kicker mb-1">{kicker}</div>}
        <StoryLink card={card} href={href}>
          <h4 className={`${withExcerpt ? "line-clamp-2" : "line-clamp-3"} font-pub-head text-base font-bold leading-snug text-pub-ink hover:text-pub`}>
            {card.title}
          </h4>
        </StoryLink>
        {withExcerpt && card.excerpt && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">{card.excerpt}</p>}
        <Meta card={card} lang={lang} />
      </div>
      <StoryLink card={card} href={href} className="shrink-0">
        <Picture card={card} className="size-16 rounded transition hover:opacity-90" />
      </StoryLink>
    </div>
  );
}

/** The breaking lead in the hero's centre. */
export function LeadStory({ card, href, lang }: { card: ArticleCard; href: StoryHref; lang: SiteLanguage }) {
  const kicker = storyKicker(card, lang);
  return (
    <article>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded bg-pub/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-pub">
          <span className="size-2 animate-pulse rounded-full bg-pub" />
          {tr(lang, "live")}
        </span>
        <span className="rounded bg-pub px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{tr(lang, "breaking")}</span>
        {kicker && <span className="pub-kicker">{kicker}</span>}
      </div>
      <StoryLink card={card} href={href} className="group block">
        <Picture card={card} className="aspect-video transition group-hover:opacity-95" />
        <h1 className="mt-4 font-pub-head text-2xl font-extrabold leading-tight text-pub-ink group-hover:text-pub sm:text-3xl lg:mt-5 lg:text-4xl">
          {card.title}
        </h1>
      </StoryLink>
      <Meta card={card} lang={lang} />
      {card.excerpt && <p className="mt-3 text-base leading-relaxed text-gray-600 lg:mt-4 lg:text-lg">{card.excerpt}</p>}
    </article>
  );
}

/** Section header: the last word in red, with "See all" when it has a page (Magazine.tsx). */
export function SectionHeader({ title, href, lang }: { title: string; href?: string; lang: SiteLanguage }) {
  const parts = title.trim().split(" ");
  const last = parts.length > 1 ? parts.pop() : "";
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-t-2 border-pub-ink pt-3">
      <h2 className="font-pub-head text-2xl font-extrabold leading-tight text-pub-ink lg:text-[28px]">
        {parts.join(" ")} {last && <span className="text-pub">{last}</span>}
      </h2>
      {href && (
        <a href={href} className="shrink-0 text-sm font-semibold text-pub hover:underline">
          {lang === "kn" ? "ಎಲ್ಲಾ ನೋಡಿ" : "See all"} ›
        </a>
      )}
    </div>
  );
}

/** Four image cards in a row, divided by thin rules. */
export function SpotlightRow({ title, seeAll, cards, href, lang }: { title: string; seeAll?: string; cards: ArticleCard[]; href: StoryHref; lang: SiteLanguage }) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHeader title={title} href={seeAll} lang={lang} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0">
        {cards.map((card, i) => {
          const kicker = storyKicker(card, lang);
          return (
            <article key={card.id} className={`flex flex-col ${i > 0 ? "lg:border-l lg:border-gray-200 lg:pl-6" : ""} ${i < cards.length - 1 ? "lg:pr-6" : ""}`}>
              <StoryLink card={card} href={href} className="group block overflow-hidden">
                <Picture card={card} className="aspect-video transition duration-300 group-hover:opacity-90" />
              </StoryLink>
              {kicker && <div className="pub-kicker mt-3">{kicker}</div>}
              <StoryLink card={card} href={href}>
                <h3 className="mt-1 line-clamp-3 font-pub-head text-lg font-bold leading-snug text-pub-ink hover:text-pub">{card.title}</h3>
              </StoryLink>
              {card.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">{card.excerpt}</p>}
              <div className="mt-2 text-xs text-gray-400">{relativeTime(card.publishedAt, lang)}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** A big feature story beside a numbered "Most Read" list with thumbnails. */
export function FeatureList({ feature, list, href, lang }: { feature: ArticleCard; list: ArticleCard[]; href: StoryHref; lang: SiteLanguage }) {
  const kicker = storyKicker(feature, lang);
  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StoryLink card={feature} href={href} className="group block">
            {kicker && <div className="pub-kicker mb-2">{kicker}</div>}
            <h2 className="font-pub-head text-3xl font-extrabold leading-tight text-pub-ink group-hover:text-pub lg:text-[40px] lg:leading-[1.1]">
              {feature.title}
            </h2>
            <Picture card={feature} className="mt-5 h-64 transition duration-300 group-hover:opacity-95 sm:h-80 lg:h-[26rem]" />
          </StoryLink>
          {feature.excerpt && <p className="mt-4 line-clamp-3 text-base leading-relaxed text-gray-600 lg:text-lg">{feature.excerpt}</p>}
          <Meta card={feature} lang={lang} />
        </div>
        {list.length > 0 && (
          <div className="lg:border-l lg:border-gray-200 lg:pl-8">
            <SectionHeader title={tr(lang, "mostRead")} lang={lang} />
            <ol>
              {list.map((card, i) => (
                <li key={card.id} className="flex items-start gap-4 border-b border-gray-200 py-4 first:pt-0 last:border-0">
                  <span className="font-pub-head text-2xl font-extrabold leading-none text-pub">{String(i + 1).padStart(2, "0")}</span>
                  <StoryLink card={card} href={href} className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 font-pub-head font-bold leading-snug text-pub-ink hover:text-pub">{card.title}</h4>
                    <div className="mt-0.5 text-xs text-gray-400">{relativeTime(card.publishedAt, lang)}</div>
                  </StoryLink>
                  <StoryLink card={card} href={href} className="shrink-0">
                    <Picture card={card} className="h-16 w-20 rounded transition hover:opacity-90" />
                  </StoryLink>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

/** A grid card (news/ArticleCard.tsx). */
export function GridCard({ card, href, lang }: { card: ArticleCard; href: StoryHref; lang: SiteLanguage }) {
  const kicker = storyKicker(card, lang);
  return (
    <article className="group flex h-full flex-col">
      <StoryLink card={card} href={href} className="block overflow-hidden">
        <Picture card={card} className="aspect-video transition duration-300 group-hover:opacity-90" />
      </StoryLink>
      <div className="flex flex-1 flex-col pt-3">
        {kicker && <div className="pub-kicker mb-1">{kicker}</div>}
        <StoryLink card={card} href={href}>
          <h3 className="line-clamp-2 min-h-[3.25rem] font-pub-head text-lg font-bold leading-snug text-pub-ink group-hover:text-pub">{card.title}</h3>
        </StoryLink>
        {card.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{card.excerpt}</p>}
        <div className="mt-auto pt-2 text-xs text-gray-400">
          {card.author.name} · {relativeTime(card.publishedAt, lang)}
        </div>
      </div>
    </article>
  );
}
