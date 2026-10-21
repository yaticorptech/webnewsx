import { hasIndicScript } from "@/components/feed/script";
import { SITE_NAME } from "@/lib/config";
import { getSitemapData } from "@/lib/server-api";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Google News only wants stories from the last two days (at most 1,000). */
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const MAX = 1000;

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** /news-sitemap.xml — the Google News sitemap: recent stories with their publication, language and title. */
export async function GET(): Promise<Response> {
  const { articles } = await getSitemapData();
  const since = Date.now() - WINDOW_MS;
  const recent = articles.filter((story) => new Date(story.publishedAt).getTime() >= since).slice(0, MAX);
  const entries = recent
    .map(
      (story) => `  <url>
    <loc>${xml(absoluteUrl(`/a/${story.slug}`))}</loc>
    <news:news>
      <news:publication><news:name>${SITE_NAME}</news:name><news:language>${hasIndicScript(story.title) ? "kn" : "en"}</news:language></news:publication>
      <news:publication_date>${story.publishedAt}</news:publication_date>
      <news:title>${xml(story.title)}</news:title>
    </news:news>${story.coverUrl ? `\n    <image:image><image:loc>${xml(absoluteUrl(story.coverUrl))}</image:loc></image:image>` : ""}
  </url>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
