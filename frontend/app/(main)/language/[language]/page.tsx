import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Feed } from "@/components/feed/feed";
import { FeedHeader } from "@/components/feed/feed-header";
import { languagesLabel, parseLanguages, type FeedView } from "@/components/feed/feed-views";
import { NewsFeed } from "@/components/feed/news-feed";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { getFeedPage } from "@/lib/server-api";
import { getSiteViewer } from "@/lib/session";
import { newShuffleSeed, visitorShuffleSeed } from "@/lib/shuffle";

type Params = Promise<{ language: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const languages = parseLanguages((await params).language);
  if (!languages) return { title: "Language not found", robots: { index: false } };
  const label = languagesLabel(languages);
  const path = `/language/${languages.join(",")}`;
  const title = `${label} news`;
  const description = `The latest stories in ${label} — live on WebNEWS.`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: path } };
}

/**
 * /language/<code>[,<code>…] (owner 2026-10-05, the Languages menu next to Karnataka): only the news in the picked
 * language(s) — one or several together — cards or reels like Home, in a fresh mix on every visit.
 */
export default async function LanguagePage({ params }: { params: Params }) {
  const languages = parseLanguages((await params).language);
  if (!languages) notFound();
  const view: Extract<FeedView, { kind: "language" }> = { kind: "language", languages };
  const key = languages.join(",");
  // Logged out: newest first, not a fresh mix (the blurred stories past the free ones stay the same on a refresh).
  const viewer = await getSiteViewer();
  // Visitors: the day's mix, the same all day (lib/shuffle.ts).
  const shuffle = viewer ? newShuffleSeed() : visitorShuffleSeed();
  const [initialPage, layout] = await Promise.all([getFeedPage({ languages, shuffle }), getFeedLayout()]);
  return (
    <section aria-labelledby="feed-heading">
      <FeedHeader view={view} />
      {layout === "reel" ? (
        <Feed key={`reel:${key}`} view={view} initialPage={initialPage} />
      ) : (
        <NewsFeed key={key} view={view} initialPage={initialPage} />
      )}
    </section>
  );
}
