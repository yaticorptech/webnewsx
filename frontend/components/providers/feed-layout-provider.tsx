"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { isFeedPath } from "@/components/feed/feed-views";
import { FEED_LAYOUT_COOKIE, FEED_LAYOUT_MAX_AGE, type FeedLayout } from "@/lib/feed-layout";
import { isNativeApp } from "@/lib/native-app";
import { track } from "@/lib/track";

type FeedLayoutState = {
  layout: FeedLayout;
  setLayout: (layout: FeedLayout) => void;
  /** Just switched: the layout being loaded (its skeleton shows, PendingPage), else null. */
  switching: FeedLayout | null;
};

const FeedLayoutContext = createContext<FeedLayoutState>({ layout: "grid", setLayout: () => {}, switching: null });

/** A switch shows the new layout's skeleton for at least this long (owner 2026-10-05: "2 sec"), then until it's loaded. */
const SWITCH_MS = 2000;
/** Set on an app launch's first page (sessionStorage: a new launch starts empty). */
const APP_OPENED_KEY = "webnews:app-opened";

/**
 * The feed layout switch's state (lib/feed-layout.ts). Changing it saves the cookie and re-renders the page from the
 * server, so Home and every category show the new layout at once; from any other page it opens Home. Meanwhile the whole
 * page shows the new layout's skeleton for 2 s (and until it's loaded).
 */
export function FeedLayoutProvider({ initial, children }: { initial: FeedLayout; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [layout, setState] = useState(initial);
  const [loading, startTransition] = useTransition();
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);
  const setLayout = useCallback(
    (next: FeedLayout) => {
      track(next === "reel" ? "layout_reel" : "layout_grid");
      document.cookie = `${FEED_LAYOUT_COOKIE}=${next}; path=/; max-age=${FEED_LAYOUT_MAX_AGE}; samesite=lax`;
      setState(next);
      setHolding(true);
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => setHolding(false), SWITCH_MS);
      window.scrollTo({ top: 0, behavior: "instant" });
      startTransition(() => {
        if (isFeedPath(pathname)) router.refresh();
        else {
          // From a story, a profile…: open Home in the NEW layout. refresh() first empties the router's cache — else
          // Home came back from it in the old layout (owner 2026-10-15: "tapped Reels, still the grid").
          router.refresh();
          router.push("/");
        }
      });
    },
    [pathname, router],
  );
  // The app always opens on Home (owner 2026-10-16): the first page of an app session that lands on the feed in reels
  // goes back to the grid. Only on launch (sessionStorage is fresh for each launch) and only on "/" — a notification
  // opening a story is left alone; switching to reels afterwards works as usual.
  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      if (sessionStorage.getItem(APP_OPENED_KEY)) return;
      sessionStorage.setItem(APP_OPENED_KEY, "1");
    } catch {
      return;
    }
    if (initial !== "reel" || pathname !== "/") return;
    document.cookie = `${FEED_LAYOUT_COOKIE}=grid; path=/; max-age=${FEED_LAYOUT_MAX_AGE}; samesite=lax`;
    startTransition(() => {
      setState("grid");
      router.refresh();
    });
    // Once, on launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Never stuck on the switch's skeleton (owner 2026-10-16): still loading after 10 s → load the page fresh.
  useEffect(() => {
    if (!loading) return;
    const rescue = setTimeout(() => window.location.reload(), 10_000);
    return () => clearTimeout(rescue);
  }, [loading]);
  const switching = holding || loading ? layout : null;
  const value = useMemo(() => ({ layout, setLayout, switching }), [layout, setLayout, switching]);
  return <FeedLayoutContext.Provider value={value}>{children}</FeedLayoutContext.Provider>;
}

export function useFeedLayout(): FeedLayoutState {
  return useContext(FeedLayoutContext);
}

/** This page is a feed shown as reels (Home or a category, with the reel layout chosen). */
export function useReelFeed(): boolean {
  const { layout } = useFeedLayout();
  const pathname = usePathname();
  return layout === "reel" && isFeedPath(pathname);
}
