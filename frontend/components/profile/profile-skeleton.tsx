import { Skeleton } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { GRID_CLASS, TileSkeleton } from "./grid-parts";

/** Loading state in the exact footprint of the profile: the plain header (portrait on the left, name, counts, bio, actions), tabs, grid. */
export function ProfileSkeleton() {
  return (
    <div aria-busy="true" data-page="profile" className="flex flex-col gap-4 sm:gap-5">
      <SpeedLinesLoader size="sm" label="Loading profile" className="sr-only" />
      <div aria-hidden className="card px-4 py-4 sm:px-8 sm:py-6">
        <div data-own-back="" data-app-no-back="" className="mb-3 flex sm:mb-4">
          <Skeleton className="size-7 rounded-md" />
        </div>
        <div className="flex gap-4 sm:gap-8">
          <Skeleton className="size-25.5 shrink-0 rounded-full sm:size-35" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <Skeleton className="h-7 w-44 rounded-md max-sm:hidden" />
            <Skeleton className="h-5 w-64 max-w-full rounded-md" />
            <Skeleton shape="pill" className="h-3.5 w-32 max-sm:hidden" />
            <Skeleton shape="pill" className="h-3.5 w-56 max-w-full max-sm:hidden" />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5 sm:hidden">
          <Skeleton className="h-6 w-44 rounded-md" />
          <Skeleton shape="pill" className="h-3.5 w-32" />
          <Skeleton className="mt-1 h-10 w-full rounded-full" />
        </div>
      </div>
      <div aria-hidden className="mt-2 flex h-14 items-center gap-7 border-b border-border">
        <Skeleton shape="pill" className="h-3.5 w-24" />
      </div>
      <div aria-hidden className={GRID_CLASS}>
        {Array.from({ length: 6 }, (_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
