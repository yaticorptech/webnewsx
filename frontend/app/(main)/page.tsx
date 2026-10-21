import { Feed } from "@/components/feed/feed";
import { NewsFeed } from "@/components/feed/news-feed";
import { FollowingSignedOut } from "@/components/feed/feed-empty";
import { FeedHeader } from "@/components/feed/feed-header";
import { parseHomeTab } from "@/components/feed/feed-views";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { getFeedPage, getTopPublishers } from "@/lib/server-api";
import { newShuffleSeed } from "@/lib/shuffle";
import { getSiteViewer } from "@/lib/session";

const SUGGESTED_PUBLISHERS = 5;

/**
 * Home (SPEC §3.4 / §3.4b / §3.12) — YouTube-style 16:9 cards, or full-screen 9:16 reels when the visitor picked them
 * with the switch beside Home (owner 2026-10-05: that switch replaced Newsy; lib/feed-layout.ts):
 * every category, newest first; `?tab=following` = reporters you
 * follow (needs an account); `?tab=latest` = newest first (old links; not in the nav). Category pages live
 * at /category/…. The first page is server-rendered for a fast first paint; the client `Feed` takes over
 * for infinite scroll and realtime.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const view = parseHomeTab((await searchParams).tab);
  const tab = view.kind === "tab" ? view.tab : "foryou";
  const [viewer, layout] = await Promise.all([getSiteViewer(), getFeedLayout()]);

  if (tab === "following" && !viewer) {
    return (
      <section aria-labelledby="feed-heading">
        <FeedHeader view={view} />
        <FollowingSignedOut />
      </section>
    );
  }

  const [initialPage, suggestions] = await Promise.all([
    // A fresh mix on every visit (owner 2026-10-05); Following stays newest first. Logged out: always newest first
    // (owner 2026-10-08), so a refresh can't swap the blurred stories past the free ones into view.
    getFeedPage({ tab, shuffle: tab === "following" || !viewer ? null : newShuffleSeed() }),
    tab === "following" ? getTopPublishers(SUGGESTED_PUBLISHERS) : Promise.resolve([]),
  ]);

  return (
    <section aria-labelledby="feed-heading">
      <FeedHeader view={view} />
      {layout === "reel" ? (
        <Feed key={`reel:${tab}`} view={view} initialPage={initialPage} suggestions={suggestions} />
      ) : (
        <NewsFeed key={tab} view={view} initialPage={initialPage} suggestions={suggestions} />
      )}
    </section>
  );
}
