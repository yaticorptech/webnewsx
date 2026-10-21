"use client";

import { useNow } from "@/lib/hooks/use-now";
import { PRESENCE_ONLINE_MS } from "@/lib/shared/contracts";

/** Is the other person of a direct chat online (WebNEWS open within PRESENCE_ONLINE_MS)? Re-checked as the clock ticks. */
export function useOnline(activeAt: string | null | undefined): boolean {
  const now = useNow();
  return Boolean(now && activeAt && now - new Date(activeAt).getTime() < PRESENCE_ONLINE_MS);
}
