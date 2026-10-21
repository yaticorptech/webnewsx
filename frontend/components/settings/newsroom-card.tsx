"use client";

import { useQuery } from "@tanstack/react-query";
import { NewsroomDashboard, type NewsroomDashboardProps } from "@/components/newsroom/newsroom-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";

/**
 * The Newsroom inside Settings (owner 2026-10-12: "show it on the right like the other options"): the same dashboard as
 * /newsroom, its first frame loaded here in the browser instead of on the server.
 */
export function NewsroomCard({ viewer }: { viewer: NewsroomDashboardProps["viewer"] }) {
  const initial = useQuery({
    queryKey: ["settings-newsroom"],
    queryFn: async ({ signal }) => {
      const [summary, series, stories, bestTimes, spotlight] = await Promise.all([
        api.newsroom.summary(7, signal),
        api.newsroom.series(7, undefined, signal),
        api.newsroom.stories(null, signal),
        api.newsroom.bestTimes(undefined, signal),
        api.newsroom.spotlight(signal),
      ]);
      return { summary, series, stories, bestTimes, spotlight };
    },
    staleTime: 60_000,
  });
  if (initial.isError) {
    return <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your Newsroom. {errorMessage(initial.error)}</p>;
  }
  if (!initial.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  return <NewsroomDashboard viewer={viewer} initial={initial.data} showSpotlight={false} />;
}
