"use client";

import { usePathname } from "next/navigation";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Loading UI inside the Editor Desk shell, shaped like the page being opened: the Overview (KPI cards, pulse,
 * activity) or a console list (search/filters + rows).
 */
export default function AdminLoading() {
  const overview = usePathname() === "/admin";
  return (
    <div role="status" aria-label="Loading the Editor Desk" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton shape="pill" className="h-2.5 w-24" />
        <Skeleton className="h-9 w-56 max-w-full rounded-md" />
        <Skeleton shape="pill" className="h-3 w-full max-w-lg" />
      </div>
      {overview ? <OverviewSkeleton /> : <ListSkeleton />}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-5">
            <Skeleton shape="pill" className="h-2.5 w-24" />
            <Skeleton className="h-10 w-16 rounded-md" />
            <Skeleton shape="pill" className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card flex flex-col gap-2.5 p-4">
            <Skeleton shape="pill" className="h-2.5 w-20" />
            <Skeleton className="h-7 w-14 rounded-md" />
          </div>
        ))}
      </div>
      <div className="card flex flex-col divide-y divide-border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton shape="circle" className="size-9 shrink-0" />
            <SkeletonText lines={2} className="min-w-0 flex-1" />
          </div>
        ))}
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} shape="pill" className="h-10 w-24" />
        ))}
      </div>
      <Skeleton shape="pill" className="h-11 w-full max-w-md" />
      <div className="card flex flex-col divide-y divide-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="aspect-video w-24 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4 rounded-sm" />
              <Skeleton className="h-3 w-1/3 rounded-sm" />
            </div>
            <Skeleton shape="pill" className="hidden h-8 w-24 sm:block" />
          </div>
        ))}
      </div>
    </>
  );
}
