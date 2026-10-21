"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Inside a route's loading screen: if it's still up after `refreshAfter` ms, ask the server for the page again — what
 * a pull-to-refresh does (owner 2026-10-10: coming back to Home in the app, the skeleton stayed until they pulled down;
 * a page download cut off half-way — "The destination stream closed early" in the dev log — can leave the router
 * waiting for data that never comes). Still up after `reloadAfter` ms: reload the page. The timers stop the moment the
 * page arrives (the loading screen unmounts).
 */
export function LoadingWatchdog({ refreshAfter = 6000, reloadAfter = 20000 }: { refreshAfter?: number; reloadAfter?: number }) {
  const router = useRouter();
  useEffect(() => {
    const soft = window.setTimeout(() => router.refresh(), refreshAfter);
    const hard = window.setTimeout(() => window.location.reload(), reloadAfter);
    return () => {
      window.clearTimeout(soft);
      window.clearTimeout(hard);
    };
  }, [router, refreshAfter, reloadAfter]);
  return null;
}
