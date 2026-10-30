import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/publisher/ad-slot";
import { SiteArticleViews, SiteShare } from "@/components/publisher/site-article-client";
import { SiteChrome } from "@/components/publisher/site-chrome";
import { GridCard, HeadlineRow, relativeTime, storyImage, storyKicker } from "@/components/publisher/site-parts";
import { getSiteArticle } from "@/lib/server-api";

type Props = { params: Promise<{ domain: string; slug: string }> };

export const dynamic = "force-dynamic";

/** Their site's home: the domain itself in production; this app's /pub/<domain> while developing (no DNS locally). */
const homeOf = (domain: string) => (process.env.NODE_ENV === "production" ? `https://${domain}/` : `/pub/${domain}`);

/** Splits the body after its third paragraph, where the in-article poster goes (webnews.in). */
function splitBody(html: string): [string, string] {
  let at = -1;
  for (let i = 0; i < 3; i++) {
    const next = html.indexOf("</p>", at + 1);
    if (next === -1) return [html, ""];
    at = next;
  }
  return [html.slice(0, at + 4), html.slice(at + 4)];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, slug } = await params;
  const data = await getSiteArticle(decodeURIComponent(domain), slug);
  if (!data) return { title: "Not found", robots: { index: false } };
  const { article, site } = data;
  const image = storyImage(article);
  return {
    title: { absolute: `${article.title} · ${site.title}` },
    description: article.blurb ?? article.excerpt ?? undefined,
    openGraph: { siteName: site.title, title: article.title, type: "article", images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title: article.title, images: image ? [image] : undefined },
    icons: site.logoUrl ? { icon: site.logoUrl } : undefined,
  };
}

/**
 * A publisher's story, on WebNEWS (owner 2026-10-29: "redirect to our main website but layout same as webnews.in, to
 * get views in main website"): their header, ads and footer around it; premium stories open in full.
 */
export default async function PublisherArticle({ params }: Props) {
  const { domain, slug } = await params;
  const data = await getSiteArticle(decodeURIComponent(domain), slug);
  if (!data) notFound();
  const { site, article, more, breaking, ads } = data;
  const href = (card: { slug: string }) => `${site.articleBase}/${card.slug}`;
  const kicker = storyKicker(article);
  const media = article.articleMedia;
  const image = media?.url || storyImage(article);
  const video = media?.video ?? article.video ?? null;
  const [before, after] = splitBody(article.bodyHtml);

  return (
    <SiteChrome site={site} homeHref={homeOf(site.domain)} ticker={breaking.length ? breaking : more.slice(0, 6)} articleBase={site.articleBase} ads={ads}>
      <SiteArticleViews id={article.id} />
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
        <article className="min-w-0 lg:col-span-8">
          <nav className="text-xs text-gray-500">
            <a href={homeOf(site.domain)} className="hover:text-pub">
              Home
            </a>
            {kicker && <span> › {kicker}</span>}
          </nav>
          {kicker && <div className="pub-kicker mt-4">{kicker}</div>}
          <h1 className="mt-2 font-pub-head text-3xl font-extrabold leading-tight text-pub-ink sm:text-4xl lg:text-[44px] lg:leading-[1.1]">{article.title}</h1>
          {article.blurb && <p className="mt-4 text-lg leading-relaxed text-gray-600">{article.blurb}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-gray-200 py-3 text-sm text-gray-500">
            <span className="font-semibold text-pub-ink">{article.author.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={article.publishedAt}>{relativeTime(article.publishedAt)}</time>
            {article.readingMinutes > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{article.readingMinutes} min read</span>
              </>
            )}
          </div>

          <figure className="mt-6">
            {video ? (
              <video src={video.url} poster={image || undefined} controls playsInline className="aspect-video w-full bg-black object-contain" />
            ) : image ? (
              <img src={image} alt="" className="aspect-video w-full bg-gray-100 object-cover" />
            ) : null}
          </figure>
          <AdSlot position="article-strip" ads={ads} className="mx-auto mt-3 max-w-sm" />

          <div className="pub-body mt-6 font-pub-sans text-[1.0625rem] leading-[1.8] text-gray-800" dangerouslySetInnerHTML={{ __html: before }} />
          <AdSlot position="in-article" ads={ads} className="mx-auto my-8 w-full max-w-[480px]" />
          {after && <div className="pub-body font-pub-sans text-[1.0625rem] leading-[1.8] text-gray-800" dangerouslySetInnerHTML={{ __html: after }} />}

          <div className="mt-8 border-t border-gray-200 pt-5">
            <SiteShare title={article.title} />
          </div>
        </article>

        <aside className="flex flex-col gap-6 lg:col-span-4 lg:border-l lg:border-gray-200 lg:pl-8">
          <AdSlot position="trending-sidebar" ads={ads} className="mx-auto w-full max-w-[380px]" />
          {more.length > 0 && (
            <div>
              <h2 className="pub-section-head">More Stories</h2>
              <div className="flex flex-col gap-4">
                {more.slice(0, 5).map((card) => (
                  <HeadlineRow key={card.id} card={card} href={href} />
                ))}
              </div>
            </div>
          )}
          <AdSlot position="hero-right" ads={ads} className="mx-auto w-full max-w-[380px]" />
        </aside>
      </div>

      <AdSlot position="mid-page" ads={ads} className="mx-auto mt-12 max-w-5xl" />

      {more.length > 5 && (
        <section className="mt-12 border-t border-gray-200 pt-6">
          <h2 className="pub-section-head">Latest News</h2>
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {more.slice(5).map((card) => (
              <GridCard key={card.id} card={card} href={href} />
            ))}
          </div>
        </section>
      )}
      <p className="mt-10 text-center text-xs text-gray-400">
        Published on {new Date(article.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
    </SiteChrome>
  );
}
