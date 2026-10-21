import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/article/article-view";
import { OpenAtTop } from "@/components/article/open-at-top";
import { Comments } from "@/components/article/comments";
import { MoreStories } from "@/components/article/more-stories";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { PublisherReel } from "@/components/article/publisher-reel";
import { StoryReelsRadio } from "@/components/article/story-reels-radio";
import { SiteFooter } from "@/components/layout/site-footer";
import { hasIndicScript } from "@/components/feed/script";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/config";
import { getArticleBySlug } from "@/lib/server-api";
import type { ArticleDetail } from "@/lib/shared/contracts";
import { absoluteUrl } from "@/lib/utils";

/** Search results show ~160 characters: cut the excerpt on a word boundary. */
function metaDescription(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s.,;:!?\-–—]+$/u, "")}…`;
}

/** "PT12S" (schema.org / ISO 8601 duration). */
function isoDuration(ms: number): string {
  return `PT${Math.max(1, Math.round(ms / 1000))}S`;
}

/**
 * schema.org data for search engines (Google News / Top stories): the NewsArticle with its images, author, publisher
 * (with logo), language and — for video stories — the VideoObject, plus the breadcrumb Home › publisher › story.
 */
function structuredData(article: ArticleDetail) {
  const url = absoluteUrl(`/a/${article.slug}`);
  const authorUrl = absoluteUrl(`/${article.author.username}`);
  const image = {
    "@type": "ImageObject",
    url: absoluteUrl(article.coverUrl),
    ...(article.coverWidth && article.coverHeight ? { width: article.coverWidth, height: article.coverHeight } : {}),
  };
  const publisher = {
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl("/icons/icon-512.png"), width: 512, height: 512 },
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        "@id": `${url}#article`,
        headline: article.title.slice(0, 110),
        description: article.excerpt,
        image: [image],
        thumbnailUrl: absoluteUrl(article.coverUrl),
        datePublished: article.publishedAt,
        dateModified: article.publishedAt,
        inLanguage: hasIndicScript(article.title) ? "kn" : "en",
        isAccessibleForFree: true,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        author: { "@type": "Person", name: article.author.name, url: authorUrl },
        publisher,
        ...(article.video
          ? {
              video: {
                "@type": "VideoObject",
                name: article.title,
                description: article.excerpt || SITE_DESCRIPTION,
                thumbnailUrl: [absoluteUrl(article.coverUrl)],
                uploadDate: article.publishedAt,
                contentUrl: absoluteUrl(article.video.url),
                duration: isoDuration(article.video.durationMs),
                width: article.video.width,
                height: article.video.height,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: article.author.name, item: authorUrl },
          { "@type": "ListItem", position: 3, name: article.title, item: url },
        ],
      },
    ],
  };
}

export async function generateMetadata({ params }: PageProps<"/a/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getArticleBySlug(slug);
  if (!data) return { title: "Story not found", robots: { index: false } };

  const { article } = data;
  const url = absoluteUrl(`/a/${article.slug}`);
  const image = {
    url: absoluteUrl(article.coverUrl),
    ...(article.coverWidth && article.coverHeight ? { width: article.coverWidth, height: article.coverHeight } : {}),
    alt: article.title,
  };
  const description = metaDescription(article.excerpt || SITE_DESCRIPTION);
  return {
    title: article.title,
    description,
    alternates: { canonical: url },
    authors: [{ name: article.author.name, url: absoluteUrl(`/${article.author.username}`) }],
    creator: article.author.name,
    publisher: SITE_NAME,
    // Big image previews in Google (Discover / Top stories) and full snippets.
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      title: article.title,
      description,
      locale: hasIndicScript(article.title) ? "kn_IN" : "en_IN",
      publishedTime: article.publishedAt,
      modifiedTime: article.publishedAt,
      authors: [absoluteUrl(`/${article.author.username}`)],
      images: [image],
      ...(article.video
        ? { videos: [{ url: absoluteUrl(article.video.url), type: "video/mp4", width: article.video.width, height: article.video.height }] }
        : {}),
    },
    twitter: { card: "summary_large_image", title: article.title, description, images: [image.url] },
  };
}

/**
 * Full article page (SPEC §3.5), then the publisher's other stories as reels (owner 2026-09-26), closed by the site
 * footer (§3.10). Phones read story → comments → more from the publisher → footer. Unknown or unpublished slugs → the
 * branded 404.
 */
/** ≥1280px: the story column and the comments panel side by side, centred together. */
const STORY_GRID = "xl:grid xl:grid-cols-[minmax(0,48rem)_24rem] xl:justify-center xl:gap-x-10";

export default async function ArticlePage({ params }: PageProps<"/a/[slug]">) {
  const { slug } = await params;
  const [data, layout] = await Promise.all([getArticleBySlug(slug), getFeedLayout()]);
  if (!data) notFound();
  const { article, moreFromAuthor } = data;

  const jsonLd = structuredData(article);

  return (
    <>
      {/* ≥1280px: the story (up to 48rem) with its comments in a sticky panel right beside it, the pair centred — no
          gap in the middle on wide screens (owner 2026-09-30); `data-wide-page` widens the shell's column. Narrower:
          comments under the story. The grid ends with the story, so the panel (story A's comments and composer) never
          stays stuck beside the publisher's other stories below. */}
      <div data-wide-page className={`${STORY_GRID} xl:items-start`}>
        <div className="min-w-0 xl:col-start-1">
          <ArticleView article={article} />
        </div>
        {/* A story the Editor Desk hid (only its author and admins can open it) takes no comments. */}
        {!article.hidden && (
          <aside aria-label="Comments" className="xl:sticky xl:top-[calc(var(--nav-h)+1.25rem)] xl:col-start-2 xl:row-start-1">
            <Comments article={article} />
          </aside>
        )}
      </div>
      {/* Below the story: reels stay in the story's column (the same grid, lined up); the grid layout uses the whole
          width under both the story and its comments (owner 2026-10-16: no blank right side). */}
      <div data-wide-page className={layout === "reel" ? STORY_GRID : undefined}>
        <div className={layout === "reel" ? "min-w-0 xl:col-start-1" : "min-w-0"}>
        {/* One News radio over both reel sections (owner 2026-10-01). */}
        <StoryReelsRadio key={`radio-${article.id}`}>
          {/* Keyed by story: opening another one of this publisher's reels starts its list fresh. */}
          <PublisherReel
            key={article.id}
            username={article.author.username}
            excludeId={article.id}
            initialStories={moreFromAuthor.filter((story) => story.id !== article.id)}
          />
          {/* Then everyone else's latest stories, page after page (owner 2026-09-28: "don't stop scrolling"). */}
          <MoreStories key={`more-${article.id}`} excludeId={article.id} authorId={article.author.id} />
        </StoryReelsRadio>
        <SiteFooter className="mt-10 sm:mt-16" />
        </div>
      </div>
      {/* Last, not first: the router decides whether to scroll by the page's first element, and this invisible one
          always looked "on screen" — so a story could open halfway down (owner 2026-10-16). */}
      <script
        type="application/ld+json"
        // JSON-LD data block; "<" is escaped so user text can't close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <OpenAtTop key={article.id} />
    </>
  );
}
