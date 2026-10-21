import { Skeleton } from "@/components/ui/skeleton";

/**
 * /messages placeholder: the heading, the tabs and chat rows. From 1024px the list is already on screen (the layout's
 * left pane), so the right pane only shows the chat skeleton's quiet top.
 */
function MessagesLoadingContent() {
  return (
    <div role="status" aria-label="Loading messages" className="flex flex-col gap-5 lg:hidden">
      <div className="flex flex-col gap-3">
        <Skeleton shape="pill" className="h-3 w-20" />
        <Skeleton className="h-9 w-48 rounded-md" />
      </div>
      <Skeleton shape="pill" className="h-9 w-56" />
      <div className="card divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton shape="circle" className="size-13 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3 rounded-sm" />
              <Skeleton className="h-3.5 w-2/3 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function MessagesLoading() {
  return (
    <div data-route-loading="" className="contents">
      <MessagesLoadingContent />
    </div>
  );
}
