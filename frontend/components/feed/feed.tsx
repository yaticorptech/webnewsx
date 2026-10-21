"use client";

import { usePhoneLayout } from "@/components/providers/phone-layout-provider";
import { FollowingStoriesRow } from "@/components/layout/category-circles";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { BLURRED_CARDS, BlurredReels, FREE_CARDS } from "@/components/auth/read-wall";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { newShuffleSeed, shuffleSignature } from "@/lib/shuffle";
import { SCROLL_TO_TOP_EVENT, scrollToTop } from "@/lib/scroll-to-top";
import type { ArticleCard, Page, UserRow, ViewerUser } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { CategoryEmpty, FollowingEmpty, LanguageEmpty, LatestEmpty } from "./feed-empty";
import {
  FOLLOWING_VIEW,
  HOME_VIEW,
  LATEST_VIEW,
  isRanked,
  isShuffled,
  viewCopy,
  viewId,
  viewQuery,
  viewsOfCard,
  type FeedView,
} from "./feed-views";
import {
  feedHas,
  feedItems,
  feedKey,
  prependToFeed,
  removeFromAllFeeds,
  removeFromFeed,
  seedStats,
  type FeedData,
} from "./live-state";
import { NewStoriesPill } from "./new-stories-pill";
import { NewsRadioProvider } from "./news-radio";
import { AutoScrollNudge } from "./auto-scroll-nudge";
import { ReelAutoplay, ReelAutoplayProvider, setAutoScroll, useAutoScrollPreference, useReelAutoplay } from "./reel-autoscroll";
import { ReelCard, ReelSkeleton } from "./reel-card";
import { firstReelOnScreen, useOneReelPerSwipe, useSnapFreeScrollToTop } from "./reel-scroll";

export type FeedProps = {
  /** Home (ranked), Following, a category or a Karnataka district (feed-views.ts). */
  view: FeedView;
  /** Server-rendered first page (SSR, fast first paint). */
  initialPage: Page<ArticleCard>;
  /** Publishers suggested when the Following feed is empty. */
  suggestions?: UserRow[];
};

/** A "back to top" trip counts as arrived (arrivals may slide in again) above this offset. */
const PILL_THRESHOLD = 400;
/** How long a live arrival keeps its "Just in" label. */
const ARRIVAL_MS = 60_000;
const STAGGER_MS = 70;

/** A story that arrived live: `animate` = slid in; `replay` remounts it to replay the flash; `justIn` = label + flash. */
type Arrival = { animate: boolean; replay: number; justIn: boolean };

const time = (iso: string) => Date.parse(iso) || 0;
/** Newest publish time in a list (For You pages aren't chronological, so not simply the first item). */
const newestTime = (items: readonly ArticleCard[]) => items.reduce((max, item) => Math.max(max, time(item.publishedAt)), 0);
/** Viewport top of a snapped reel: its scroll-margin (the sticky masthead + --reel-top, globals.css "Reel feed"). */
const reelSnapLine = (item: Element | undefined) => {
  const reel = item?.querySelector<HTMLElement>(".reel");
  return reel ? parseFloat(getComputedStyle(reel).scrollMarginTop) || 0 : 0;
};

/**
 * Story feed (SPEC §3.4 / §3.4b / §3.12) as full-screen reels (owner 2026-09-26, "like Instagram reels"): one story per
 * screen, shown as its poster with the action rail beside it (ReelCard), the page snapping one reel per swipe
 * (globals.css "Reel feed"; the window still scrolls, so everything below keeps working), with the rail's "Auto-scroll"
 * switch (reel-autoscroll.ts: 5 s per story) and the tap-anywhere "Read full article" popup (reel-popup.tsx).
 *
 * SSR first page → TanStack infinite query (cursor pages of 10, sentinel + a reel-shaped skeleton; Home's ranked pages
 * share one ranking snapshot and are de-duplicated by id), and realtime: published stories land at the top of Home, of
 * their category's (and district's) page, and of Following when the viewer follows the author. The reel on screen
 * never moves for them — the page is anchored (onto that reel's snap point) and they wait behind the "new stories" pill
 * (they only slide in while a trip back to the top is under way, or show up in place of an empty feed) — deleted ones
 * disappear, and a stream reconnect catches up with the first page. Scroll is never reset on mount, so Back from a
 * story lands on the same reel, shown at once (only reels appended after the first render fade in).
 */
export function Feed({ view, initialPage, suggestions = [] }: FeedProps) {
  const phone = usePhoneLayout();
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const id = viewId(view);
  const ranked = isRanked(view);
  // Logged out: newest first, never a fresh mix (as the grid — news-feed.tsx).
  const shuffled = isShuffled(view) && viewer !== null;
  const key = useMemo(() => feedKey(id, viewerId), [id, viewerId]);

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.feed({ ...viewQuery(view), cursor: pageParam, shuffle: !pageParam && shuffled ? newShuffleSeed() : null }, signal);
      seedStats(queryClient, page.items);
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialPage], pageParams: [null] },
    // For You pages share one ranking snapshot (the cursor's asOf), and a shuffled mix one seed: refetching them — on
    // remount (Back from a story), focus or staleness — would reorder and lose the reader's place. New stories still
    // arrive live; a fresh server page merges in anything missed while away, or (shuffled) brings a new mix (below).
    ...(ranked || shuffled ? { staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } : { staleTime: 60_000 }),
  });
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, error } = query;
  const all = feedItems(data);
  // Logged out (owner 2026-10-08, as the grid): FREE_CARDS reels, then BLURRED_CARDS more blurred with "Sign in to
  // read" — and no more pages until they sign in.
  const gated = useMetered();
  const items = gated ? all.slice(0, FREE_CARDS) : all;
  const blurred = gated ? all.slice(FREE_CARDS, FREE_CARDS + BLURRED_CARDS) : [];
  const moreToLoad = Boolean(hasNextPage) && (!gated || all.length < FREE_CARDS + BLURRED_CARDS);
  // Reels of the first render (the SSR page, or the cached feed on Back) don't fade in: the page's own fade covers them
  // (app/(main)/template.tsx), and a staggered delay would leave the reel Back restores blank. Appended pages cascade in.
  const [firstIds] = useState(() => new Set(items.map((item) => item.id)));

  /* ── Live arrivals, "new stories" pill, scroll anchoring ── */

  const [arrivals, setArrivals] = useState<ReadonlyMap<string, Arrival>>(() => new Map());
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  /** The reel to keep on screen: its viewport top, and `snap` = it goes back onto its own snap point (not to `top`). */
  const anchor = useRef<{ id: string; top: number; snap: boolean; waitFor: readonly string[] } | null>(null);
  /** While the pill's smooth scroll to the top runs, arrivals must not re-anchor (that would stop it). */
  const jumping = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const expireLater = useCallback((ids: readonly string[]) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setArrivals((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => {
          const arrival = next.get(id);
          if (arrival) next.set(id, { ...arrival, justIn: false });
        });
        return next;
      });
    }, ARRIVAL_MS);
    timers.current.add(timer);
  }, []);

  /** Remember the reel on screen so the page can be kept still after inserting `waitFor` above it. */
  const captureAnchor = (waitFor: readonly string[]) => {
    if (anchor.current) {
      anchor.current = { ...anchor.current, waitFor: [...anchor.current.waitFor, ...waitFor] };
      return;
    }
    const nodes = document.querySelectorAll<HTMLElement>("[data-feed-item]");
    const line = reelSnapLine(nodes[0]);
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      // The first reel reaching below the masthead (the one above a snapped reel ends under it).
      if (rect.bottom > line + 1) {
        // Resting on its snap point, or on the page-top stop above it (≥1024px masthead row, a notice above the feed).
        const snap = Math.abs(rect.top - line) < 2 || window.scrollY < 1;
        anchor.current = { id: node.dataset.feedItem!, top: rect.top, snap, waitFor };
        return;
      }
    }
  };

  // Once the inserted stories are rendered, put the anchored reel back with an absolute scrollTo — never scrollBy, a
  // directional scroll that stops at the first `snap-stop: always` reel on its way (an arrival); mandatory snapping also
  // moves any position between two snap points onto the nearer one. A snapped reel goes back onto its snap point. At the
  // page-top stop no snap point keeps it still (the rows above it scroll away), so it settles onto its own, as one swipe
  // would, and stays the reel on screen. Mid-swipe, its offset is restored.
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!saved) return;
    // Heading back to the top: a position captured further down must not be restored mid-trip.
    if (jumping.current) {
      anchor.current = null;
      return;
    }
    const rendered = new Set(items.map((item) => item.id));
    if (!saved.waitFor.every((id) => rendered.has(id))) return;
    anchor.current = null;
    const node = document.querySelector<HTMLElement>(`[data-feed-item="${CSS.escape(saved.id)}"]`);
    if (!node) return;
    const target = window.scrollY + node.getBoundingClientRect().top - (saved.snap ? reelSnapLine(node) : saved.top);
    if (Math.abs(target - window.scrollY) > 0.5) window.scrollTo({ top: target, behavior: "instant" });
  }, [items]);

  /** Put stories at the top of the visible feed: anchored + pill, or animated in during a trip to the top / into an empty feed. */
  const insertVisible = useCallback(
    (cards: readonly ArticleCard[]) => {
      const current = queryClient.getQueryData<FeedData>(key);
      if (!current) return;
      const fresh = cards.filter((card) => !feedHas(current, card.id));
      if (fresh.length === 0) return;
      const ids = fresh.map((card) => card.id);
      // A reel fills the screen: sliding a story in on top would push the one being read away. So the page stays
      // anchored and arrivals wait behind the pill — unless the reader is already on the way back to the top, or the
      // feed was empty (its empty state is on screen: the arrival shows up right there, no pill to point up to it).
      const anchored = !jumping.current && feedItems(current).length > 0;
      if (anchored) captureAnchor(ids);
      setArrivals((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => next.set(id, { animate: !anchored, replay: 0, justIn: true }));
        return next;
      });
      expireLater(ids);
      if (anchored) setPendingIds((prev) => [...ids, ...prev]);
      queryClient.setQueryData<FeedData>(key, (prev) => prependToFeed(prev, fresh));
    },
    [queryClient, key, expireLater],
  );

  /** The feed on screen animates the arrival; cached feeds just get it on top for when they're opened. */
  const addToView = useCallback(
    (target: FeedView, cards: readonly ArticleCard[]) => {
      const targetId = viewId(target);
      if (targetId === id) insertVisible(cards);
      else queryClient.setQueryData<FeedData>(feedKey(targetId, viewerId), (prev) => prependToFeed(prev, cards));
    },
    [insertVisible, queryClient, id, viewerId],
  );

  /** Does the viewer follow `username`? true/false when known locally, undefined otherwise. */
  const knownFollow = (username: string): boolean | undefined => {
    const cached = queryClient.getQueryData<boolean>(qk.followState(username));
    if (typeof cached === "boolean") return cached;
    for (const target of [FOLLOWING_VIEW, LATEST_VIEW, HOME_VIEW, view]) {
      const card = feedItems(queryClient.getQueryData<FeedData>(feedKey(viewId(target), viewerId))).find(
        (item) => item.author.username === username,
      );
      if (card) return target === FOLLOWING_VIEW || card.viewer.followingAuthor;
    }
    return undefined;
  };

  useRealtimeEvent("article.published", (raw) => {
    const follows = knownFollow(raw.author.username);
    const card = withViewerFlags(raw, viewer, follows ?? false);
    for (const target of viewsOfCard(card)) addToView(target, [card]);
    if (!viewerId || card.viewer.isAuthor) return;
    if (follows === true) {
      addToView(FOLLOWING_VIEW, [card]);
    } else if (follows === undefined && queryClient.getQueryData(feedKey(viewId(FOLLOWING_VIEW), viewerId))) {
      // Unknown relationship and a Following feed to keep current: ask once.
      api
        .profile(raw.author.username)
        .then((profile) => {
          if (profile.viewer.follows) addToView(FOLLOWING_VIEW, [{ ...card, viewer: { ...card.viewer, followingAuthor: true } }]);
        })
        .catch(() => {});
    }
  });

  useRealtimeEvent("article.deleted", ({ id }) => {
    removeFromAllFeeds(queryClient, id);
    setPendingIds((prev) => prev.filter((pendingId) => pendingId !== id));
  });

  // Back online: merge what we missed from the first page (new stories, deletions), refresh counts.
  useRealtimeReconnect(() => {
    api
      .feed(viewQuery(view))
      .then((page) => {
        seedStats(queryClient, page.items);
        const current = queryClient.getQueryData<FeedData>(key);
        if (!current) return;
        const newest = newestTime(feedItems(current));
        insertVisible(page.items.filter((item) => time(item.publishedAt) > newest));
        // Chronological feeds only: anything missing between the top and the page's oldest story was deleted.
        const oldest = page.items.at(-1);
        if (oldest && !ranked) {
          const fetched = new Set(page.items.map((item) => item.id));
          const gone = feedItems(current).filter(
            (item) => time(item.publishedAt) >= time(oldest.publishedAt) && !fetched.has(item.id),
          );
          if (gone.length) queryClient.setQueryData<FeedData>(key, (prev) => removeFromFeed(prev, new Set(gone.map((g) => g.id))));
        }
      })
      .catch(() => {});
    void queryClient.invalidateQueries({ queryKey: qk.feedAll, refetchType: "none", predicate: (q) => q.queryKey[1] !== id });
  });

  // A fresh server page (navigation back to "/", router.refresh) may hold stories this cached
  // feed never saw (published while it was unmounted): merge them in on top.
  useEffect(() => {
    const current = queryClient.getQueryData<FeedData>(key);
    if (!current || current.pages[0] === initialPage) return;
    seedStats(queryClient, initialPage.items);
    // A refresh (or a new visit) brought a new mix (owner 2026-10-05: different stories every refresh); the same mix
    // again (Back) keeps the reader's place.
    if (shuffled) {
      const first = current.pages[0];
      if (!first || shuffleSignature(first) !== shuffleSignature(initialPage)) {
        queryClient.setQueryData<FeedData>(key, { pages: [initialPage], pageParams: [null] });
      }
      return;
    }
    const newest = newestTime(feedItems(current));
    const missed = initialPage.items.filter((item) => !feedHas(current, item.id) && time(item.publishedAt) > newest);
    if (missed.length) queryClient.setQueryData<FeedData>(key, (prev) => prependToFeed(prev, missed));
    // Only when the server page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage]);

  /* ── Pill: reset when the reader gets back to the top ── */

  const replay = useCallback((ids: readonly string[]) => {
    setArrivals((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const arrival = next.get(id);
        if (arrival) next.set(id, { ...arrival, replay: arrival.replay + 1, justIn: true });
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (pendingIds.length === 0) return;
    const onScroll = () => {
      // Reels snap below the masthead (and below the ≥1024px masthead row), so "at the top" = the first reel is up.
      if (window.scrollY > 120 && !firstReelOnScreen()) return;
      replay(pendingIds);
      expireLater(pendingIds);
      setPendingIds([]);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pendingIds, replay, expireLater]);

  /** Until the page reaches the top (or 5 s pass, or the reader takes over), arrivals just stack on top. */
  const startJump = useCallback(() => {
    jumping.current = true;
    anchor.current = null; // a pending "keep my place" from before the jump no longer applies
    const stop = () => {
      jumping.current = false;
      clearTimeout(failsafe);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
    const onScroll = () => {
      if (window.scrollY < PILL_THRESHOLD) stop();
    };
    const failsafe = setTimeout(stop, 5_000);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
  }, []);

  // The floating back-to-top button (and "You're all caught up") scroll home the same way as the pill.
  useEffect(() => {
    window.addEventListener(SCROLL_TO_TOP_EVENT, startJump);
    return () => window.removeEventListener(SCROLL_TO_TOP_EVENT, startJump);
  }, [startJump]);
  // …with snapping suspended on the way (the trip is a series of instant jumps the page would snap back).
  useSnapFreeScrollToTop();
  // Phones: exactly one reel per swipe (reel-scroll.ts).
  useOneReelPerSwipe();

  const jumpToNew = () => {
    const ids = pendingIds;
    setPendingIds([]);
    scrollToTop(reduceMotion ? "instant" : "smooth"); // → SCROLL_TO_TOP_EVENT → startJump()
    replay(ids);
    expireLater(ids);
    const first = ids[0];
    if (first) {
      document
        .querySelector<HTMLElement>(`[data-feed-item="${CSS.escape(first)}"] h2 a`)
        ?.focus({ preventScroll: true });
    }
  };

  /* ── Infinite scroll ── */

  const sentinel = useRef<HTMLDivElement>(null);
  const canLoadMore = moreToLoad && !isFetchingNextPage && !isFetchNextPageError;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "0px 0px 1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);

  /* ── Auto-scroll ── */

  const autoScroll = useAutoScrollPreference();
  const [autoplay] = useState(() => new ReelAutoplay());
  useReelAutoplay(autoplay, autoScroll, {
    hasNextPage: moreToLoad,
    loadMore: () => {
      if (!isFetchingNextPage) void fetchNextPage();
    },
    // The true end of the feed: switch off and show "You're all caught up".
    onEnd: () => {
      setAutoScroll(false);
      document.querySelector("[data-feed-end]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });

  /* ── Render ── */

  if (items.length === 0) {
    if (view.kind === "category") return <CategoryEmpty category={view.category} district={view.district} />;
    if (view.kind === "language") return <LanguageEmpty languages={view.languages} />;
    return view.tab === "following" ? <FollowingEmpty suggestions={suggestions} /> : <LatestEmpty kicker={viewCopy(view).kicker} />;
  }

  // Stagger index within each page, so each appended page cascades in (reels of the first render don't fade: firstIds).
  const pageIndex = new Map<string, number>();
  data.pages.forEach((page) => page.items.forEach((item, i) => pageIndex.set(item.id, i)));

  return (
    // data-reel-feed: <html> snaps one reel per swipe while this is on the page (globals.css "Reel feed").
    <div className="relative" data-reel-feed="">
      <NewStoriesPill count={pendingIds.length} onClick={jumpToNew} />
      {/* Phones (owner 2026-10-15): after 2 stories, "Auto-scroll" slides in from the right; again after 10, then 15. */}
      <AutoScrollNudge enabled={phone && !autoScroll} />
      {/* Desktop Following in reels too (owner 2026-10-15): the followed reporters' stories above the reels. */}
      {!phone && view.kind === "tab" && view.tab === "following" && <FollowingStoriesRow className="mb-4 border-b border-border pb-4" />}

      <ReelAutoplayProvider value={autoplay}>
        <NewsRadioProvider
          items={items}
          hasNextPage={moreToLoad}
          loadMore={() => {
            if (!isFetchingNextPage) void fetchNextPage();
          }}
          autoplay={autoplay}
        >
          <ol aria-label={viewCopy(view).listLabel} className="flex flex-col">
            <AnimatePresence initial={false}>
              {items.map((article, index) => {
                const arrival = arrivals.get(article.id);
                const fadeIn = !arrival && !firstIds.has(article.id);
                return (
                  <motion.li
                    key={article.id}
                    data-feed-item={article.id}
                    // Live arrival during a trip to the top: the slot expands, the reel slides down into it.
                    // Overflow is clipped only while it expands / collapses (focus rings, flash, menus stay visible).
                    initial={arrival?.animate ? { height: 0, opacity: 0, y: -24, overflow: "hidden" } : false}
                    animate={{ height: "auto", opacity: 1, y: 0, transitionEnd: { overflow: "visible" } }}
                    exit={{ height: 0, opacity: 0, overflow: "hidden", transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } }}
                    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* Spacing lives inside the animated slot so a live arrival's gap expands with it. */}
                    <div
                      className={cn("pb-(--reel-gap)", fadeIn && "animate-fade-up")}
                      style={fadeIn ? { animationDelay: `${Math.min(pageIndex.get(article.id) ?? 0, 6) * STAGGER_MS}ms` } : undefined}
                    >
                      <ReelCard
                        key={arrival ? `live-${arrival.replay}` : "card"}
                        article={article}
                        priority={index === 0}
                        highlight={arrival?.justIn === true}
                      />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </NewsRadioProvider>
      </ReelAutoplayProvider>

      {blurred.length > 0 && <BlurredReels articles={blurred} />}

      <div ref={sentinel} aria-hidden className="h-px" />

      {isFetchingNextPage && <ReelSkeleton />}

      {isFetchNextPageError && (
        <div role="alert" className="card reel-snap flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="font-wide text-base font-extrabold text-ink">Couldn&apos;t load more stories</p>
          <p className="text-sm text-muted">{errorMessage(error)}</p>
          <Button variant="outline" leftIcon={<RotateCcw aria-hidden />} onClick={() => void fetchNextPage()}>
            Try again
          </Button>
        </div>
      )}

      {!hasNextPage && blurred.length === 0 && <EndOfFeed />}
    </div>
  );
}


function withViewerFlags(card: ArticleCard, viewer: ViewerUser | null, followingAuthor: boolean): ArticleCard {
  const isAuthor = viewer !== null && viewer.id === card.author.id;
  return { ...card, viewer: { liked: false, isAuthor, followingAuthor: isAuthor ? false : followingAuthor } };
}

/** The end of the feed (a snap stop, and where auto-scroll lands when it runs out of stories). */
function EndOfFeed() {
  return (
    <div data-feed-end className="panel-tint reel-snap flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
      <SpeedBarsSvg className="w-9 text-brand" />
      <p className="kicker text-ink">You&apos;re all caught up</p>
      <p className="max-w-xs text-sm text-muted">New stories appear at the top the moment they&apos;re published.</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => scrollToTop("smooth")}
        className="mt-1 text-brand"
      >
        Back to top
      </Button>
    </div>
  );
}
