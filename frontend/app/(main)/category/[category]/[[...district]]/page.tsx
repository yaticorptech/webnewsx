import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Feed } from "@/components/feed/feed";
import { NewsFeed } from "@/components/feed/news-feed";
import { DistrictBar } from "@/components/feed/district-bar";
import { FeedHeader } from "@/components/feed/feed-header";
import type { FeedView } from "@/components/feed/feed-views";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { getFeedPage } from "@/lib/server-api";
import { getSiteViewer } from "@/lib/session";
import { newShuffleSeed, visitorShuffleSeed } from "@/lib/shuffle";
import { CATEGORY_LABELS, DISTRICT_CATEGORY, categoryLabel, categoryPath, districtFromSlug, isCategory } from "@/lib/shared/contracts";

type Params = Promise<{ category: string; district?: string[] }>;
type CategoryView = Extract<FeedView, { kind: "category" }>;

/** `/category/<category>` or `/category/karnataka/<district slug>` → its view; anything else → null (404). */
function parseView({ category, district }: Awaited<Params>): CategoryView | null {
  if (!isCategory(category)) return null;
  if (!district?.length) return { kind: "category", category, district: null };
  if (category !== DISTRICT_CATEGORY || district.length !== 1) return null;
  const name = districtFromSlug(district[0] ?? "");
  return name ? { kind: "category", category, district: name } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const view = parseView(await params);
  if (!view) return { title: "Section not found", robots: { index: false } };
  const title = categoryLabel(view.category, view.district);
  const description = view.district
    ? `The latest stories from ${view.district}, Karnataka — live on WebNEWS.`
    : `The latest ${CATEGORY_LABELS[view.category]} stories — live on WebNEWS.`;
  const url = categoryPath(view.category, view.district);
  return {
    title,
    description,
    keywords: [title, `${title} news`, view.district ? "Karnataka news" : "India news", "WebNEWS"],
    alternates: { canonical: url },
    openGraph: { images: ["/opengraph-image"], type: "website", siteName: "WebNEWS", locale: "en_IN", title, description, url },
  };
}

/**
 * A category page (SPEC §3.12): that category's stories newest first — or, inside Karnataka, one district's.
 * Same feed as Home — cards, or reels when the visitor picked them beside Home (SSR first page, infinite scroll, live
 * arrivals); the category nav marks where you are.
 */
export default async function CategoryPage({ params }: { params: Params }) {
  const view = parseView(await params);
  if (!view) notFound();
  // Logged out: newest first, not a fresh mix (the blurred stories past the free ones stay the same on a refresh).
  const viewer = await getSiteViewer();
  // Visitors: the day's mix, the same all day (lib/shuffle.ts).
  const shuffle = viewer ? newShuffleSeed() : visitorShuffleSeed();
  const [initialPage, layout] = await Promise.all([getFeedPage({ category: view.category, district: view.district, shuffle }), getFeedLayout()]);
  const key = `${view.category}:${view.district ?? ""}`;
  return (
    <section aria-labelledby="feed-heading">
      <FeedHeader view={view} />
      {view.category === DISTRICT_CATEGORY && <DistrictBar district={view.district} />}
      {layout === "reel" ? (
        <Feed key={`reel:${key}`} view={view} initialPage={initialPage} />
      ) : (
        <NewsFeed key={key} view={view} initialPage={initialPage} />
      )}
    </section>
  );
}
