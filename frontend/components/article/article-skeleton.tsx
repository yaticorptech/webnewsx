import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Story-shaped placeholder in the page's current order: cover, labels · time · reading time, headline, the rule under
 * it, the story text, the source card, the views/like/share bar and the "About the publisher" card. Used by the story's
 * loading.tsx and by the shell the moment a story link is tapped (components/layout/pending-page.tsx).
 */
export function ArticleSkeleton() {
  return (
    <div role="status" aria-label="Loading story" className="pb-4">
      <div className="skeleton relative -mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-2xl">
        <SpeedBarsSvg className="absolute left-1/2 top-1/2 w-20 -translate-x-1/2 -translate-y-1/2 text-ink opacity-[0.06]" />
      </div>
      <div className="mt-6 flex items-center gap-2 sm:mt-8">
        <Skeleton shape="pill" className="h-2.5 w-16" />
        <Skeleton shape="pill" className="ml-auto h-6 w-28" />
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        <Skeleton className="h-7 w-[94%] rounded-md sm:h-8" />
        <Skeleton className="h-7 w-[68%] rounded-md sm:h-8" />
      </div>
      <div aria-hidden className="mt-6 flex items-center gap-2 sm:mt-7">
        <span className="h-1 w-12 rounded-full bg-brand/25" />
        <span className="h-px flex-1 bg-border" />
      </div>
      <SkeletonText lines={4} className="mt-8" />
      <SkeletonText lines={5} className="mt-6" />
      <SkeletonText lines={3} className="mt-6" />
      <div className="card mt-10 flex items-center gap-4 p-4">
        <Skeleton className="size-11 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton shape="pill" className="h-2.5 w-32" />
          <Skeleton shape="pill" className="h-3 w-3/5" />
        </div>
      </div>
      <div className="mt-10 flex items-center justify-between border-y border-border py-3.5">
        <div className="flex items-center gap-5">
          <Skeleton shape="pill" className="h-4 w-12" />
          <Skeleton shape="pill" className="h-4 w-10" />
          <Skeleton shape="pill" className="h-4 w-12" />
        </div>
        <Skeleton shape="pill" className="h-4 w-16" />
      </div>
      <div className="panel-tint mt-12 flex flex-col gap-4 p-5">
        <Skeleton shape="pill" className="h-2.5 w-36" />
        <div className="flex items-center gap-4">
          <Skeleton shape="circle" className="size-16 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton shape="pill" className="h-4 w-40 max-w-full" />
            <Skeleton shape="pill" className="h-3 w-24" />
          </div>
        </div>
        <Skeleton shape="pill" className="h-10 w-32" />
      </div>
    </div>
  );
}
