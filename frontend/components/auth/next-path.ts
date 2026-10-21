import { safeNextPath } from "@/lib/utils";

/** Appends `?next=` (already sanitised with `safeNextPath`) so it survives hops between auth pages. */
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads `?next=` from page search params (same-site paths only); "/" is the default and returns null. */
export async function readNextParam(searchParams: PageSearchParams): Promise<string | null> {
  const { next } = await searchParams;
  const path = safeNextPath(typeof next === "string" ? next : null, "/");
  return path === "/" ? null : path;
}
