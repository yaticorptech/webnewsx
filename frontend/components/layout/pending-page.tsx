"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import AboutLoading from "@/app/(main)/about/loading";
import CommunitiesLoading from "@/app/(main)/communities/loading";
import ExploreLoading from "@/app/(main)/explore/loading";
import MessagesLoading from "@/app/(main)/messages/loading";
import NewsroomLoading from "@/app/(main)/newsroom/loading";
import NotificationsLoading from "@/app/(main)/notifications/loading";
import PressPassLoading from "@/app/(main)/press-pass/loading";
import PublishLoading from "@/app/(main)/publish/loading";
import SettingsLoading from "@/app/(main)/settings/loading";
import TrendingLoading from "@/app/(main)/trending/loading";
import { ArticleSkeleton } from "@/components/article/article-skeleton";
import { isFeedPath } from "@/components/feed/feed-views";
import { NewsFeedSkeleton } from "@/components/feed/news-feed";
import { ReelSkeleton } from "@/components/feed/reel-card";
import { useFeedLayout } from "@/components/providers/feed-layout-provider";
import type { FeedLayout } from "@/lib/feed-layout";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { normalizeUsername, RESERVED_USERNAMES, USERNAME_REGEX } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * The page you tapped, in skeleton form — only while it's really still loading (owner 2026-10-02: no forced wait; it
 * replaced the 2-second minimum of 2026-09-29). Next.js shows a page's loading.tsx only once it knows the route —
 * instantly when the link was prefetched, but not before the server answers otherwise (the dev server never
 * prefetches, a slow network, `prefetch={false}` links) — and until then the old page just sat there. A page that
 * arrives within GRACE_MS of the tap opens straight away with no skeleton; a slower one shows its skeleton until the
 * moment it arrives, then fades in. The page being left stays mounted, hidden, so a navigation that never lands (30 s)
 * gives it back as it was.
 */

/** A page ready this soon after the tap shows no skeleton at all. */
const GRACE_MS = 250;
/** A skeleton still up after this long: the navigation is lost — load the page directly. */
const STUCK_MS = 10_000;

const SECTIONS: Record<string, () => ReactNode> = {
  about: AboutLoading,
  communities: CommunitiesLoading,
  explore: ExploreLoading,
  messages: MessagesLoading,
  newsroom: NewsroomLoading,
  notifications: NotificationsLoading,
  "press-pass": PressPassLoading,
  publish: PublishLoading,
  settings: SettingsLoading,
  trending: TrendingLoading,
};

/** The skeleton of the page at `pathname`, or null (a page outside this shell: nothing to show). */
function skeletonFor(pathname: string, layout: FeedLayout = "grid"): ReactNode {
  if (isFeedPath(pathname)) return layout === "reel" ? <ReelSkeleton label="Loading stories" /> : <NewsFeedSkeleton />;
  const [first, second] = pathname.split("/").filter(Boolean);
  if (!first) return null;
  if (first === "a") return second ? <ArticleSkeleton /> : null;
  const Section = SECTIONS[first];
  if (Section) return <Section />;
  if (second) return null;
  let username: string;
  try {
    username = normalizeUsername(decodeURIComponent(first));
  } catch {
    return null;
  }
  return USERNAME_REGEX.test(username) && !RESERVED_USERNAMES.has(username) ? <ProfileSkeleton /> : null;
}

/** `showAt`: when the skeleton appears if the page hasn't arrived by then. */
type Pending = { from: string; to: string; showAt: number };

let pending: Pending | null = null;
let giveUp: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setPending(next: Pending | null) {
  if (giveUp) clearTimeout(giveUp);
  giveUp = next ? setTimeout(() => setPending(null), 30_000) : null;
  pending = next;
  listeners.forEach((listener) => listener());
}

function clearPending(which: Pending) {
  if (pending === which) setPending(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const inMessages = (pathname: string) => /^\/messages(\/[^/]+)?$/.test(pathname);

/** Call right before a `router.push(href)` (links are picked up on their own). */
export function showPendingPage(href: string): void {
  // The Android app shows no skeletons (owner 2026-10-10): the page you're on stays until the next one is ready.
  if (document.documentElement.dataset.app === "android") return;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
  if (!skeletonFor(url.pathname)) return;
  // Two-pane Messages (≥1024px): picking another chat keeps the list on screen — no whole-page skeleton.
  if (inMessages(url.pathname) && inMessages(window.location.pathname) && window.matchMedia("(min-width: 1024px)").matches) return;
  setPending({ from: window.location.pathname, to: url.pathname, showAt: Date.now() + GRACE_MS });
}

/** Wraps the shell's page: shows the tapped page's skeleton if it takes longer than GRACE_MS, until the router lands. */
export function PendingPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { layout, switching } = useFeedLayout();
  const current = useSyncExternalStore(subscribe, () => pending, () => null);
  // Left the page the tap came from: the new page is here.
  const arrived = current !== null && current.from !== pathname;
  // The navigation whose grace time ran out before its page arrived (its skeleton is up).
  const [slow, setSlow] = useState<Pending | null>(null);
  // The grid / reel switch (owner 2026-10-05): the new layout's skeleton over the whole page for 2 s, then until loaded.
  const skeleton =
    (current && !arrived && slow === current ? skeletonFor(current.to, layout) : null) ??
    (switching ? skeletonFor(isFeedPath(pathname) ? pathname : "/", switching) : null);

  useEffect(() => {
    if (!current) return;
    if (arrived) {
      clearPending(current);
      return;
    }
    const timer = setTimeout(() => setSlow(current), Math.max(0, current.showAt - Date.now()));
    // Never stuck on a skeleton (owner 2026-10-16): if the page hasn't arrived in STUCK_MS, load it the plain way.
    const rescue = setTimeout(() => {
      if (window.location.pathname === current.from) window.location.assign(current.to);
    }, STUCK_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(rescue);
    };
  }, [current, arrived]);

  // A client-side link (Next.js's <Link> handled it: default prevented) to another page of the shell. Bubble phase, so
  // a handler that cancels the click first (the composer's unsaved-changes guard stops it) keeps it from showing.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      // `data-own-pending`: links that open the page themselves a moment later (a photo waiting to see if it's a
      // double-tap like) show the skeleton when they really navigate — never on a click that turns out to be a like.
      if (!anchor || anchor.closest("[data-composer-preview], [data-own-pending]")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      showPendingPage(anchor.href);
    };
    const onPopState = () => setPending(null);
    window.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // The skeleton starts at the top of the page, like the page it stands for.
  const showing = skeleton !== null;
  useLayoutEffect(() => {
    if (showing) window.scrollTo({ top: 0, behavior: "instant" });
  }, [showing]);

  // The arrived page fades in as its skeleton goes (owner 2026-10-01: a soft fade, not a hard cut). Before the first
  // paint, so it never flashes in at full strength; no fade under reduced motion.
  const pageRef = useRef<HTMLDivElement>(null);
  const wasShowing = useRef(false);
  useLayoutEffect(() => {
    if (wasShowing.current && !showing && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const child of pageRef.current?.children ?? []) {
        child.animate({ opacity: [0, 1] }, { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }
    wasShowing.current = showing;
  }, [showing]);

  return (
    <>
      {showing && (
        <div data-pending-page="" className="animate-fade-up">
          {skeleton}
        </div>
      )}
      <div ref={pageRef} className={cn("contents", showing && "hidden")}>
        {children}
      </div>
    </>
  );
}
