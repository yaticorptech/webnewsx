import { NewsFeedSkeleton } from "@/components/feed/news-feed";
import { LoadingWatchdog } from "@/components/layout/loading-watchdog";

/**
 * Feed loading — Home, Following and category pages (owner rule 2026-09-25: show the page's structure while it loads),
 * until the stories arrive. A skeleton that outstays a few seconds asks the
 * server again on its own (LoadingWatchdog), as a pull-to-refresh would.
 */
function MainLoadingContent() {
  return (
    <>
      <NewsFeedSkeleton />
      <LoadingWatchdog />
    </>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function MainLoading() {
  return (
    <div data-route-loading="" className="contents">
      <MainLoadingContent />
    </div>
  );
}
