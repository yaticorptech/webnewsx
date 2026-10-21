import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Press Pass placeholder: heading, the ID card and the step rail. */
function PressPassLoadingContent() {
  return (
    <div role="status" aria-label="Opening your Press Pass" className="flex flex-col">
      <Skeleton shape="pill" className="h-2.5 w-24" />
      <Skeleton className="mt-4 h-10 w-3/4 sm:h-12" />
      <SkeletonText lines={2} className="mt-4 max-w-md" />
      <Skeleton className="mt-8 aspect-8/5 w-full rounded-[1.25rem] max-sm:hidden" />
      <div className="mt-8 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-1.5 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-8 h-8 w-1/2" />
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} shape="pill" className="h-10 w-24" />
        ))}
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function PressPassLoading() {
  return (
    <div data-route-loading="" className="contents">
      <PressPassLoadingContent />
    </div>
  );
}
