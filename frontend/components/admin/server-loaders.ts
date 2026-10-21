import "server-only";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { getAdminOverview } from "@/lib/server-api";
import type { AdminOverview } from "@/lib/shared/contracts";

/**
 * The overview, fetched once per request (the layout needs it for the pending badges, the Overview
 * page for its KPIs). Null when the backend fails, so the console still renders.
 */
export const loadOverview = cache(async (): Promise<AdminOverview | null> => {
  try {
    return await getAdminOverview();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
});

/** First value of a search param (Next passes string | string[] | undefined). */
export function param(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

/** `value` when it is one of `allowed`, else `fallback`. */
export function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
