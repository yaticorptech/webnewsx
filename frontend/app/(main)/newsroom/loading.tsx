import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** /newsroom placeholder in the dashboard's footprint: header panel, range row, KPI tiles, chart and table cards. */
function NewsroomLoadingContent() {
  return (
    <div role="status" aria-label="Loading your Newsroom" data-grid-page="" className="flex flex-col gap-5 sm:gap-6">
      <div className="panel-tint flex flex-col gap-4 px-5 py-6 sm:px-8 sm:py-7">
        <Skeleton shape="pill" className="h-3 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton shape="circle" className="size-15" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-1/2 rounded-md" />
            <Skeleton shape="pill" className="h-3 w-2/3" />
          </div>
        </div>
        <SkeletonText lines={2} />
        <div className="flex gap-2.5">
          <Skeleton shape="pill" className="h-10 w-32" />
          <Skeleton shape="pill" className="h-10 w-32" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton shape="pill" className="h-3 w-28" />
        <Skeleton shape="pill" className="h-11 w-60" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1400px]:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-4 sm:p-5">
            <Skeleton shape="pill" className="h-3 w-16" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton shape="pill" className="h-5 w-14" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card flex flex-col gap-4 p-5 sm:p-6">
          <Skeleton shape="pill" className="h-4 w-44" />
          <Skeleton className="h-52 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function NewsroomLoading() {
  return (
    <div data-route-loading="" className="contents">
      <NewsroomLoadingContent />
    </div>
  );
}
