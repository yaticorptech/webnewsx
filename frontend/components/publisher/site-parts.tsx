import type { ReactNode } from "react";
import { categoryLabel, type ArticleCard } from "@/lib/shared/contracts";

/*
 * The webnews.in building blocks (its app/[lang]/page.tsx, components/home/Magazine.tsx, news/ArticleCard.tsx), drawn
 * with a publisher's own stories (owner 2026-10-29). Every story links to `href(card)` — WebNEWS's story page in the
 * same layout, so views count on WebNEWS.
 */

export type StoryHref = (card: ArticleCard) => string;

export const storyImage = (card: ArticleCard) => card.articleImage?.url || card.coverUrl;
export const storyKicker = (card: ArticleCard) => (card.category ? categoryLabel(card.category, card.district) : "");

/** "5 min ago", "3 h ago", "2 d ago", then the date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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
function Meta({ card }: { card: ArticleCard }) {
  return (
    <div className="mt-1 text-xs text-gray-400">
      {card.author.name} · {relativeTime(card.publishedAt)}
    </div>
  );
}

/** A headline with a small square thumbnail (the hero's side columns). */
export function HeadlineRow({ card, href, withExcerpt }: { card: ArticleCard; href: StoryHref; withExcerpt?: boolean }) {
  const kicker = storyKicker(card);
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
        <Meta card={card} />
      </div>
      <StoryLink card={card} href={href} className="shrink-0">
        <Picture card={card} className="size-16 rounded transition hover:opacity-90" />
      </StoryLink>
    </div>
  );
}

/** The breaking lead in the hero's centre. */
export function LeadStory({ card, href }: { card: ArticleCard; href: StoryHref }) {
  const kicker = storyKicker(card);
  return (
    <article>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded bg-pub/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-pub">
          <span className="size-2 animate-pulse rounded-full bg-pub" />
          Live
        </span>
        <span className="rounded bg-pub px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">Breaking</span>
        {kicker && <span className="pub-kicker">{kicker}</span>}
      </div>
      <StoryLink card={card} href={href} className="group block">
        <Picture card={card} className="aspect-video transition group-hover:opacity-95" />
        <h1 className="mt-4 font-pub-head text-2xl font-extrabold leading-tight text-pub-ink group-hover:text-pub sm:text-3xl lg:mt-5 lg:text-4xl">
          {card.title}
        </h1>
      </StoryLink>
      <Meta card={card} />
      {card.excerpt && <p className="mt-3 text-base leading-relaxed text-gray-600 lg:mt-4 lg:text-lg">{card.excerpt}</p>}
    </article>
  );
}

/** Section header: the last word in red (Magazine.tsx). */
export function SectionHeader({ title }: { title: string }) {
  const parts = title.trim().split(" ");
  const last = parts.length > 1 ? parts.pop() : "";
  return (
    <div className="mb-5 border-t-2 border-pub-ink pt-3">
      <h2 className="font-pub-head text-2xl font-extrabold leading-tight text-pub-ink lg:text-[28px]">
        {parts.join(" ")} {last && <span className="text-pub">{last}</span>}
      </h2>
    </div>
  );
}

/** Four image cards in a row, divided by thin rules. */
export function SpotlightRow({ title, cards, href }: { title: string; cards: ArticleCard[]; href: StoryHref }) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHeader title={title} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0">
        {cards.map((card, i) => {
          const kicker = storyKicker(card);
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
              <div className="mt-2 text-xs text-gray-400">{relativeTime(card.publishedAt)}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** A big feature story beside a numbered "Most Read" list with thumbnails. */
export function FeatureList({ feature, list, href }: { feature: ArticleCard; list: ArticleCard[]; href: StoryHref }) {
  const kicker = storyKicker(feature);
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
          <Meta card={feature} />
        </div>
        {list.length > 0 && (
          <div className="lg:border-l lg:border-gray-200 lg:pl-8">
            <SectionHeader title="Most Read" />
            <ol>
              {list.map((card, i) => (
                <li key={card.id} className="flex items-start gap-4 border-b border-gray-200 py-4 first:pt-0 last:border-0">
                  <span className="font-pub-head text-2xl font-extrabold leading-none text-pub">{String(i + 1).padStart(2, "0")}</span>
                  <StoryLink card={card} href={href} className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 font-pub-head font-bold leading-snug text-pub-ink hover:text-pub">{card.title}</h4>
                    <div className="mt-0.5 text-xs text-gray-400">{relativeTime(card.publishedAt)}</div>
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
export function GridCard({ card, href }: { card: ArticleCard; href: StoryHref }) {
  const kicker = storyKicker(card);
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
          {card.author.name} · {relativeTime(card.publishedAt)}
        </div>
      </div>
    </article>
  );
}
