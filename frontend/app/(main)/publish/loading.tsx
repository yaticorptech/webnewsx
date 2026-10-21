import { Skeleton } from "@/components/ui/skeleton";

/**
 * Composer-shaped placeholder while /publish or a draft loads (instead of the feed skeleton). From 1280px it mirrors
 * the composer's step 01 frame — the form on the left, the live preview's phone on the right — so nothing jumps
 * sideways when the composer replaces it.
 */
function PublishLoadingContent() {
  return (
    <div
      role="status"
      aria-label="Opening the composer"
      data-wide-page
      className="xl:grid xl:grid-cols-[minmax(0,40rem)_minmax(0,22rem)] xl:items-start xl:justify-between xl:gap-x-12"
    >
      <div className="flex min-w-0 flex-col xl:col-start-1">
        <Skeleton shape="pill" className="h-2.5 w-24" />
        <Skeleton className="mt-4 h-10 w-2/3 sm:h-12" />
        <Skeleton shape="text" className="mt-4 h-4 w-1/2" />
        <div className="mt-8 flex items-center gap-4 border-y border-border py-4">
          <Skeleton shape="circle" className="size-10" />
          <Skeleton shape="text" className="h-4 w-16" />
          <Skeleton className="h-0.5 flex-1" />
          <Skeleton shape="circle" className="size-10" />
          <Skeleton shape="text" className="h-4 w-16" />
        </div>
        <Skeleton className="mt-10 aspect-video w-full rounded-2xl" />
        <Skeleton shape="text" className="mt-10 h-8 w-5/6" />
        <Skeleton className="mt-10 h-72 w-full rounded-2xl" />
      </div>
      <div
        aria-hidden
        className="hidden xl:sticky xl:top-[calc(var(--nav-h)+1.25rem)] xl:col-start-2 xl:row-start-1 xl:flex xl:flex-col xl:gap-3"
      >
        <Skeleton shape="pill" className="h-2.5 w-24" />
        <Skeleton className="aspect-9/16 w-[clamp(15rem,calc((100dvh_-_var(--nav-h)_-_13rem)*9/16_+_1rem),21.25rem)] rounded-[1.75rem]" />
      </div>
    </div>
  );
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function PublishLoading() {
  return (
    <div data-route-loading="" className="contents">
      <PublishLoadingContent />
    </div>
  );
}
