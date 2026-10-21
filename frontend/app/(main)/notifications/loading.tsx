import { Skeleton } from "@/components/ui/skeleton";

/** Notifications placeholder: the title, the search box, the filter chips and a few rows. */
function NotificationsLoadingContent() {
  return (
    <div role="status" aria-label="Loading notifications" className="flex flex-col gap-4">
      <div className="flex h-10 items-center justify-center">
        <Skeleton className="h-6 w-36 rounded-md" />
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
      <div className="flex gap-2">
        <Skeleton shape="pill" className="h-8 w-20" />
        <Skeleton shape="pill" className="h-8 w-24" />
      </div>
      <Skeleton shape="pill" className="mt-2 h-3 w-16" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3 rounded-sm" />
            <Skeleton className="h-3 w-5/6 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function NotificationsLoading() {
  return (
    <div data-route-loading="" className="contents">
      <NotificationsLoadingContent />
    </div>
  );
}
