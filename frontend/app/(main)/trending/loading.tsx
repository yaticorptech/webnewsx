import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** /trending placeholder: the pink header panel and ranked rows in a card. */
function TrendingLoadingContent() {
  return (
    <div role="status" aria-label="Loading trending stories" className="flex flex-col gap-5 sm:gap-6">
      <div className="panel-tint flex flex-col gap-3 px-5 py-6 sm:px-8 sm:py-8">
        <Skeleton shape="pill" className="h-3 w-28" />
        <Skeleton className="h-9 w-3/4 rounded-md" />
        <SkeletonText lines={2} />
      </div>
      <div className="card divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 px-4 py-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4 sm:px-6 sm:py-5">
            <Skeleton className="h-8 w-6 rounded-sm" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded-sm" />
              <Skeleton className="h-4 w-2/3 rounded-sm" />
              <Skeleton shape="pill" className="mt-1 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function TrendingLoading() {
  return (
    <div data-route-loading="" className="contents">
      <TrendingLoadingContent />
    </div>
  );
}
