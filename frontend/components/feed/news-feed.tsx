"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { LockedPhoneCard, splitForVisitor, useMarkLocked } from "@/components/auth/read-wall";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { useInfiniteSentinel } from "@/components/profile/use-infinite-sentinel";
import { usePhoneLayout } from "@/components/providers/phone-layout-provider";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { scrollToTop } from "@/lib/scroll-to-top";
import { newShuffleSeed, shuffleSignature, visitorShuffleSeed } from "@/lib/shuffle";
import type { ArticleCard, Page, UserRow, ViewerUser } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { FeedWish, useFeedWishes } from "@/components/wishes/feed-wishes";
import { CategoryEmpty, FollowingEmpty, LanguageEmpty, LatestEmpty } from "./feed-empty";
import { FOLLOWING_VIEW, isRanked, isShuffled, viewCopy, viewId, viewQuery, viewsOfCard, type FeedView } from "./feed-views";
import { feedHas, feedItems, feedKey, prependToFeed, removeFromAllFeeds, seedStats, type FeedData } from "./live-state";
import { NewStoriesPill } from "./new-stories-pill";
import { FollowingStoriesRow } from "@/components/layout/category-circles";
import { FrontPage, FrontPageSkeleton } from "./front-page";
import { PhoneStoryCard, PhoneStoryCardSkeleton } from "./phone-story-card";
import { NewsRadioProvider } from "./news-radio";
import { ReelAutoplay } from "./reel-autoscroll";

export type NewsFeedProps = {
  view: FeedView;
  /** Server-rendered first page (fast first paint). */
  initialPage: Page<ArticleCard>;
  /** Publishers suggested when the Following feed is empty. */
  suggestions?: UserRow[];
};

/** Near the top, a live arrival slides straight in; further down it waits behind the "new stories" pill. */
const NEAR_TOP_PX = 320;
const ARRIVAL_MS = 60_000;

/**
 * Poster tiles like Search (owner 2026-10-05): 2 across on phones, 3 on small tablets, 4 on tablets, then 5 in a row
 * from laptops up (owner 2026-10-08) — the tiles widen with the screen, each with its actions under it.
 */
export const NEWS_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-3 md:grid-cols-4 md:gap-x-4 md:gap-y-7 lg:grid-cols-5";

/**
 * Phones (< 640px; owner 2026-10-10, from their Instagram-style reference): one post after another, every one the same
 * (phone-story-card.tsx) — across the screen's full width, a thin line between posts. Wider screens keep the poster
 * grid.
 */
const PHONE_LIST = "-mx-4 flex flex-col divide-y divide-border";

/**
 * Home, Following and the category pages as a grid of story posters (owner 2026-10-05, like Search; YouTube-style
 * 16:9 cards before): 2 per row on phones up to 5 on laptops and wider, across the page's full width (`data-grid-page`; no
 * side rail) — endless. Phones (< 640px, in the app and in a phone's browser) show one post after another instead
 * (PHONE_LIST). The 9:16 reels (feed.tsx) are the other layout of the same pages,
 * picked with the switch beside Home (owner 2026-10-05) — both read the same cached feed.
 * Live: a story published while you're near the top slides in with "Just in"; further down it waits behind the
 * "new stories" pill; deleted stories disappear; a reconnect refreshes the list.
 */
export function NewsFeed({ view, initialPage, suggestions = [] }: NewsFeedProps) {
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const queryClient = useQueryClient();
  const phone = usePhoneLayout();
  const { weave } = useFeedWishes();
  const id = viewId(view);
  const key = useMemo(() => feedKey(id, viewerId), [id, viewerId]);

  // Logged out: the day's mix (one seed all day, lib/shuffle.ts) — Home (For You) included, the API serves visitors
  // the mix when sent the seed — so the stories blurred past the free ones don't change on a refresh; signed in: a
  // fresh mix on every visit of Latest, a category or a language.
  const shuffled = isShuffled(view) || (!viewer && isRanked(view));
  const seed = () => (viewer ? newShuffleSeed() : visitorShuffleSeed());
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.feed({ ...viewQuery(view), cursor: pageParam, shuffle: !pageParam && shuffled ? seed() : null }, signal);
      seedStats(queryClient, page.items);
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialPage], pageParams: [null] },
    // A ranked snapshot or a shuffled mix (one seed) isn't refetched behind the reader's back: it would reorder.
    ...(isRanked(view) || shuffled ? { staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } : { staleTime: 60_000 }),
  });
  // A refresh (or a new visit) brings a new mix (owner 2026-10-05: different stories every refresh); the same mix
  // again (Back) keeps the reader's place.
  useEffect(() => {
    if (!shuffled) return;
    const first = queryClient.getQueryData<FeedData>(key)?.pages[0];
    if (first && first !== initialPage && shuffleSignature(first) !== shuffleSignature(initialPage)) {
      seedStats(queryClient, initialPage.items);
      queryClient.setQueryData<FeedData>(key, { pages: [initialPage], pageParams: [null] });
    }
    // Only when the server page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage]);
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, error } = query;
  const all = feedItems(data);
  // Logged out (owner 2026-10-08 / 2026-10-22): FREE_CARDS of the day's mix open, then BLURRED_CARDS blurred under
  // "Sign in to read" in the same rows, and no more pages until they sign in (read-wall.tsx).
  const gated = useMetered();
  const { free: items, locked: blurred, complete } = splitForVisitor(all, gated);
  // Opening a blurred story directly is locked too (read-meter.ts).
  useMarkLocked(blurred);
  const moreToLoad = Boolean(hasNextPage) && !complete;
  // News radio (the cards' radio button) reads the stories one after another; there's no auto-scroll here to hold.
  const [autoplay] = useState(() => new ReelAutoplay());

  /* ── Live arrivals ── */

  const [justIn, setJustIn] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ArticleCard[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const markJustIn = useCallback((ids: string[]) => {
    setJustIn((prev) => new Set([...prev, ...ids]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setJustIn((prev) => new Set([...prev].filter((x) => !ids.includes(x))));
    }, ARRIVAL_MS);
    timers.current.add(timer);
  }, []);

  const showNow = useCallback(
    (cards: ArticleCard[]) => {
      const fresh = cards.filter((card) => !feedHas(queryClient.getQueryData<FeedData>(key), card.id));
      if (fresh.length === 0) return;
      queryClient.setQueryData<FeedData>(key, (prev) => prependToFeed(prev, fresh));
      markJustIn(fresh.map((card) => card.id));
    },
    [queryClient, key, markJustIn],
  );

  const arrive = useCallback(
    (target: FeedView, card: ArticleCard) => {
      const targetId = viewId(target);
      if (targetId !== id) {
        queryClient.setQueryData<FeedData>(feedKey(targetId, viewerId), (prev) => prependToFeed(prev, [card]));
        return;
      }
      if (window.scrollY < NEAR_TOP_PX) showNow([card]);
      else setPending((prev) => (prev.some((p) => p.id === card.id) ? prev : [card, ...prev]));
    },
    [id, queryClient, viewerId, showNow],
  );

  useRealtimeEvent("article.published", (raw) => {
    const card = withViewerFlags(raw, viewer);
    for (const target of viewsOfCard(card)) arrive(target, card);
    if (viewerId && !card.viewer.isAuthor && queryClient.getQueryData<boolean>(qk.followState(raw.author.username)) === true) {
      arrive(FOLLOWING_VIEW, { ...card, viewer: { ...card.viewer, followingAuthor: true } });
    }
  });

  useRealtimeEvent("article.deleted", ({ id: gone }) => {
    removeFromAllFeeds(queryClient, gone);
    setPending((prev) => prev.filter((card) => card.id !== gone));
  });

  useRealtimeReconnect(() => void queryClient.invalidateQueries({ queryKey: key }));

  // Scrolled back up by hand: the waiting stories slide in.
  useEffect(() => {
    if (pending.length === 0) return;
    const onScroll = () => {
      if (window.scrollY >= NEAR_TOP_PX) return;
      showNow(pending);
      setPending([]);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pending, showNow]);

  const jumpToNew = () => {
    showNow(pending);
    setPending([]);
    scrollToTop("smooth");
  };

  /* ── Infinite scroll ── */

  const sentinel = useInfiniteSentinel<HTMLDivElement>({
    enabled: moreToLoad && !isFetchingNextPage && !isFetchNextPageError,
    onReach: () => void fetchNextPage(),
    rootMargin: "0px 0px 1200px 0px",
  });

  if (items.length === 0) {
    if (view.kind === "category") return <CategoryEmpty category={view.category} district={view.district} />;
    if (view.kind === "language") return <LanguageEmpty languages={view.languages} />;
    return view.tab === "following" ? <FollowingEmpty suggestions={suggestions} /> : <LatestEmpty kicker={viewCopy(view).kicker} />;
  }

  return (
    <div data-grid-page="" className="relative">
      <NewStoriesPill count={pending.length} onClick={jumpToNew} />
      <NewsRadioProvider
        items={items}
        hasNextPage={moreToLoad}
        loadMore={() => {
          if (!isFetchingNextPage) void fetchNextPage();
        }}
        autoplay={autoplay}
      >
        {phone ? (
          <ol aria-label={viewCopy(view).listLabel} className={PHONE_LIST}>
            {/* Birthday wishes & invitations between the stories, never on top (owner 2026-10-31). */}
            {weave(items).map((entry) =>
              entry.kind === "wish" ? (
                // A clear gap before and after a wish, so it reads apart from the stories (owner 2026-10-31).
                <li key={`wish-${entry.wish.id}`} className="min-w-0 pb-5 pt-4">
                  <FeedWish wish={entry.wish} />
                </li>
              ) : (
                <li
                  key={entry.item.id}
                  data-feed-item={entry.item.id}
                  className={cn("min-w-0 scroll-mt-nav pt-1.5", entry.index >= initialPage.items.length && "animate-fade-up")}
                >
                  <PhoneStoryCard article={entry.item} priority={entry.index < 2} justIn={justIn.has(entry.item.id)} />
                </li>
              ),
            )}
            {/* A visitor's stories past the free ones carry straight on in the list, blurred (owner 2026-10-22). */}
            {blurred.map((article) => (
              <li key={article.id} className="min-w-0 pt-1.5">
                <LockedPhoneCard article={article} />
              </li>
            ))}
            {isFetchingNextPage &&
              Array.from({ length: 2 }, (_, i) => (
                <li key={`s${i}`} className="pt-1.5">
                  <PhoneStoryCardSkeleton />
                </li>
              ))}
          </ol>
        ) : (
          <>
          {/* Desktop Following (owner 2026-10-15): the followed reporters' stories as circles, above the news. */}
          {view.kind === "tab" && view.tab === "following" && <FollowingStoriesRow className="mb-6 border-b border-border pb-4" />}
          {/* Tablets and computers (owner 2026-10-15): one newspaper front page for Home, Following and every category /
              language page (front-page.tsx); its India · World … sections only on Home. */}
          <FrontPage
            items={items}
            locked={blurred}
            justIn={justIn}
            loadingMore={isFetchingNextPage}
            ended={!moreToLoad}
            sections={view.kind === "tab" && view.tab !== "following"}
            weave={weave}
          />
          </>
        )}
      </NewsRadioProvider>

      <div ref={sentinel} aria-hidden className="h-px" />

      {isFetchNextPageError && (
        <div role="alert" className="card mt-8 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="font-wide text-base font-extrabold text-ink">Couldn&apos;t load more stories</p>
          <p className="text-sm text-muted">{errorMessage(error)}</p>
          <Button variant="outline" leftIcon={<RotateCcw aria-hidden />} onClick={() => void fetchNextPage()}>
            Try again
          </Button>
        </div>
      )}

      {!hasNextPage && blurred.length === 0 && (
        <div className="panel-tint mt-10 flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
          <SpeedBarsSvg className="w-9 text-brand" />
          <p className="kicker text-ink">You&apos;re all caught up</p>
          <p className="max-w-xs text-sm text-muted">New stories appear at the top the moment they&apos;re published.</p>
          <Button variant="ghost" size="sm" onClick={() => scrollToTop("smooth")} className="mt-1 text-brand">
            Back to top
          </Button>
        </div>
      )}
    </div>
  );
}

function withViewerFlags(card: ArticleCard, viewer: ViewerUser | null): ArticleCard {
  const isAuthor = viewer !== null && viewer.id === card.author.id;
  return { ...card, viewer: { liked: false, isAuthor, followingAuthor: false } };
}

/** Home's loading placeholder: the front page's shape (phones: posts). */
export function NewsFeedSkeleton({ label = "Loading stories" }: { label?: string }) {
  const phone = usePhoneLayout();
  if (phone) {
    return (
      <div role="status" aria-label={label} data-grid-page="" className={PHONE_LIST}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="pt-1.5">
            <PhoneStoryCardSkeleton />
          </div>
        ))}
      </div>
    );
  }
  // Tablets and computers: the card grid's own outline (front-page.tsx), not an older layout's.
  return (
    <div role="status" aria-label={label} data-grid-page="">
      <FrontPageSkeleton />
    </div>
  );
}
