"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AdminOverview } from "@/lib/shared/contracts";

/**
 * Editor Desk overview (KPIs + recent activity). Shared by the shell's pending badges and the
 * Overview page, so one refetch after any desk action (`invalidateQueries(qk.adminAll)`) updates both.
 */
export function useOverview(initial?: AdminOverview | null) {
  return useQuery({
    queryKey: qk.adminOverview,
    queryFn: ({ signal }) => api.admin.overview(undefined, signal),
    // Server data counts as fresh on arrival (TanStack stamps initialData with the mount time).
    initialData: initial ?? undefined,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
