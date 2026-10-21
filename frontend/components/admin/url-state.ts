"use client";

import { useState } from "react";

type Filters = Record<string, string | undefined>;

/** Drops empty values so filter objects compare (and serialise) cleanly. */
export function compact<T extends Filters>(filters: T): T {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")) as T;
}

/**
 * Filter state mirrored into the URL query (history.replaceState, which Next 16 syncs into the
 * router without a navigation), so a reload or a shared link keeps the view. Values equal to
 * `defaults` are left out of the URL.
 */
export function useUrlFilters<T extends Filters>(initial: T, defaults: Partial<T> = {}) {
  const [filters, setFilters] = useState<T>(() => compact(initial));

  const update = (patch: Partial<T>) => {
    const next = compact({ ...filters, ...patch } as T);
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const key of new Set([...Object.keys(filters), ...Object.keys(patch)])) params.delete(key);
    for (const [key, value] of Object.entries(next)) {
      if (value !== undefined && value !== defaults[key]) params.set(key, value);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };

  return [filters, update] as const;
}

/** Stable key for comparing filter objects. */
export function filtersKey(filters: Filters): string {
  return JSON.stringify(Object.entries(compact(filters)).sort(([a], [b]) => a.localeCompare(b)));
}
