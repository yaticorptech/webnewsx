import { Skeleton } from "@/components/ui/skeleton";

/** /explore placeholder: the search field and a grid of poster tiles. */
function ExploreLoadingContent() {
  return (
    <div role="status" aria-label="Loading search" className="flex flex-col gap-4">
      <Skeleton shape="pill" className="h-11 w-full" />
      <div className="grid grid-cols-3 gap-0.5 max-sm:-mx-4 sm:gap-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-9/16 rounded-none sm:rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function ExploreLoading() {
  return (
    <div data-route-loading="" className="contents">
      <ExploreLoadingContent />
    </div>
  );
}
