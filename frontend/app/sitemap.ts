import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/server-api";
import { CATEGORY_VALUES, KARNATAKA_DISTRICTS, categoryPath } from "@/lib/shared/contracts";
import { absoluteUrl } from "@/lib/utils";

// Built on request (the API isn't there at build time); search engines re-read it often.
export const dynamic = "force-dynamic";

/** sitemap.xml: the public pages, the category (+ Karnataka district) pages, every public story (with its cover) and every publisher with a public story. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { articles, publishers } = await getSitemapData();
  const newest = articles[0]?.publishedAt;
  return [
    { url: absoluteUrl("/"), lastModified: newest, changeFrequency: "always", priority: 1 },
    { url: absoluteUrl("/trending"), lastModified: newest, changeFrequency: "hourly", priority: 0.8 },
    ...CATEGORY_VALUES.map((category) => ({ url: absoluteUrl(categoryPath(category)), changeFrequency: "hourly" as const, priority: 0.8 })),
    ...KARNATAKA_DISTRICTS.map((district) => ({
      url: absoluteUrl(categoryPath("karnataka", district)),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.1 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.1 },
    ...articles.map((story) => ({
      url: absoluteUrl(`/a/${story.slug}`),
      lastModified: story.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
      ...(story.coverUrl ? { images: [absoluteUrl(story.coverUrl)] } : {}),
    })),
    ...publishers.map((publisher) => ({
      url: absoluteUrl(`/${publisher.username}`),
      lastModified: publisher.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
