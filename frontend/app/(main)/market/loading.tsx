import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** /market placeholder: the pink header panel and a grid of quote tiles. */
function MarketLoadingContent() {
  return (
    <div role="status" aria-label="Loading market prices" className="flex flex-col gap-6 sm:gap-8">
      <div className="panel-tint flex flex-col gap-3 px-5 py-6 sm:px-8 sm:py-8">
        <Skeleton shape="pill" className="h-3 w-28" />
        <Skeleton className="h-9 w-40 rounded-md" />
        <SkeletonText lines={1} />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-4 sm:p-5">
            <Skeleton className="h-4 w-1/2 rounded-sm" />
            <Skeleton className="h-8 w-3/4 rounded-md" />
            <Skeleton shape="pill" className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function MarketLoading() {
  return (
    <div data-route-loading="" className="contents">
      <MarketLoadingContent />
    </div>
  );
}
