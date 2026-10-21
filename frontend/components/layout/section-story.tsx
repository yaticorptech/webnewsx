"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import { api, type FeedParams } from "@/lib/api";
import type { NavItem } from "@/lib/categories";
import { CATEGORY_VALUES, type ArticleCard, type Category, type Page } from "@/lib/shared/contracts";
import { showPendingPage } from "./pending-page";

/** How long a section's latest story shows before its page opens (owner 2026-10-10: "3 sec", then "5 sec"). */
export const STORY_MS = 5000;

/** The feed a circle stands for: Following → the people you follow, a category → that category (For you has no story). */
function feedOf(item: NavItem): FeedParams | null {
  if (item.key === "following") return { tab: "following" };
  if ((CATEGORY_VALUES as readonly string[]).includes(item.key)) return { category: item.key as Category };
  return null;
}

export const hasSectionStory = (item: NavItem): boolean => feedOf(item) !== null;

/** How new a section's latest story must be for its circle to get the red story ring (like Instagram's 24 h). */
export const STORY_FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * The sections (of `items`) with a story published in the last 24 h (owner 2026-10-12: no new story → a plain circle;
 * one uploaded → the red ring, like Instagram). Shares SectionStory's query, so a tap shows it without another fetch.
 */
export function useFreshSectionStories(items: NavItem[]): Set<string> {
  const withStory = items.filter(hasSectionStory);
  const results = useQueries({
    queries: withStory.map((item) => ({
      queryKey: ["section-story", item.key],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.feed(feedOf(item) ?? {}, signal),
      staleTime: 60_000,
      retry: false,
      select: (page: Page<ArticleCard>) => page.items.some((card) => Date.now() - Date.parse(card.publishedAt) < STORY_FRESH_MS),
    })),
  });
  const fresh = new Set<string>();
  results.forEach((result, i) => {
    if (result.data) fresh.add(withStory[i].key);
  });
  return fresh;
}

/**
 * Like Instagram stories (owner 2026-10-10): tapping a section's circle shows the newest story published in it full
 * screen, with a progress bar across the top; after 3 s the section's page opens. Press and hold pauses it; a tap anywhere, × or
 * Esc opens the section now (owner 2026-10-10). No story in the section → its page opens straight away.
 */
export function SectionStory({
  item,
  cover,
  load,
  account = false,
  onNext,
  onClose,
}: {
  item: NavItem;
  cover?: string;
  /** Where the story comes from when it isn't a section's feed (a followed account's latest stories). */
  load?: (signal: AbortSignal) => Promise<Page<ArticleCard>>;
  /**
   * A followed account's story (owner 2026-10-12): a tap skips to the next one (`onNext`) and press-and-hold pauses;
   * swipe up reads it. When the last one ends (or ×, Esc) it just closes, leaving you on the Following page.
   */
  account?: boolean;
  /** The next account's story; called when this one is tapped or its bar ends. */
  onNext?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = feedOf(item);
  const latest = useQuery({
    queryKey: ["section-story", item.key],
    queryFn: ({ signal }) => (load ? load(signal) : api.feed(params ?? {}, signal)),
    enabled: params !== null || load !== undefined,
    staleTime: 60_000,
  });
  const story = latest.data?.items[0] ?? null;
  const [imageReady, setImageReady] = useState(false);
  // The bar runs once the story's picture is on screen (or straight away if it fails to load).
  const running = Boolean(story) && imageReady;
  // Press and hold pauses it (owner 2026-10-10, like Instagram); a hold doesn't count as a tap on the story.
  const [held, setHeld] = useState(false);
  const holdStart = useRef(0);
  const holdWasLong = useRef(false);
  const opened = useRef(false);
  // Swipe up reads the whole story (owner 2026-10-12: on phones, in place of Read more, which got lost in the tap that
  // opens the section).
  const swipeStartY = useRef<number | null>(null);
  const readStory = () => {
    if (!story || opened.current) return;
    opened.current = true;
    onClose();
    router.push(`/a/${story.slug}`);
  };
  const hold = {
    onPointerDown: (event: PointerEvent) => {
      holdStart.current = Date.now();
      holdWasLong.current = false;
      swipeStartY.current = event.clientY;
      setHeld(true);
    },
    onPointerUp: (event: PointerEvent) => {
      holdWasLong.current = Date.now() - holdStart.current > 250;
      setHeld(false);
      const startY = swipeStartY.current;
      swipeStartY.current = null;
      if (startY !== null && startY - event.clientY > 60) {
        // A swipe isn't a tap on the story either.
        holdWasLong.current = true;
        readStory();
      }
    },
    onPointerCancel: () => setHeld(false),
    onPointerLeave: () => setHeld(false),
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  };

  // Every way out — the bar ending, a tap, ×, Esc, a click outside — opens the section (owner 2026-10-10), once.
  const openSection = () => {
    if (opened.current) return;
    opened.current = true;
    onClose();
    if (account) return;
    showPendingPage(item.href);
    router.push(item.href);
  };
  // A followed account's story: on to the next one (or closed after the last).
  const skip = () => {
    if (opened.current) return;
    opened.current = true;
    (onNext ?? onClose)();
  };
  const openRef = useRef(openSection);
  useEffect(() => {
    openRef.current = openSection;
  });

  // Load the section's page while the story plays (owner 2026-10-10: "it takes too long"), so it opens at once.
  // `next dev` doesn't prefetch, so there the page is requested once to have it compiled and rendered ahead.
  useEffect(() => {
    if (account) return;
    router.prefetch(item.href);
    if (process.env.NODE_ENV === "development") void fetch(item.href).catch(() => {});
  }, [router, item.href, account]);

  useEffect(() => {
    if (latest.isError || (latest.isSuccess && !story)) {
      onClose();
      if (account) return;
      showPendingPage(item.href);
      router.push(item.href);
    }
  }, [latest.isError, latest.isSuccess, story, item.href, onClose, router, account]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") openRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Latest in ${item.label}`}
      className="fixed inset-0 z-300 flex items-center justify-center bg-black/90 sm:bg-black/75 sm:p-6 sm:backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) openSection();
      }}
    >
      {/* Like an Instagram story (owner 2026-10-12): the photo fills the whole story, the headline, a few lines, the
          author and Read more over a dark fade at the bottom, everything on one 16px edge. Phones: full screen;
          from 640px a 9:16 card in the middle. */}
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-black sm:aspect-9/16 sm:h-[min(92dvh,52rem)] sm:w-auto sm:rounded-3xl sm:shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] sm:ring-1 sm:ring-white/10">
        {/* Top fade so the bar and the section stay readable on a light photo. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-28 bg-linear-to-b from-black/70 to-transparent" />
        {/* Progress bar */}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 h-0.75 overflow-hidden rounded-full bg-white/30">
          {/* The bar's fill (globals.css @keyframes story-progress); when it ends, the section opens. */}
          <span
            className="block h-full origin-left rounded-full bg-white"
            // `transform` only (Tailwind's scale-x-* sets the separate `scale` property, which would keep it at 0).
            style={
              running
                ? { animation: `story-progress ${STORY_MS}ms linear forwards`, animationPlayState: held ? "paused" : "running" }
                : { transform: "scaleX(0)" }
            }
            onAnimationEnd={account ? skip : openSection}
          />
        </div>

        {/* Section + close */}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1.5rem)] z-10 flex items-center gap-2.5 text-white">
          <button type="button" onClick={openSection} className="flex min-w-0 items-center gap-2.5 text-left">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-brand">
              {cover ? (
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <item.icon aria-hidden className="size-4.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{item.label}</span>
              {story && (
                <span className="block text-xs text-white/75">
                  <TimeAgo date={story.publishedAt} />
                </span>
              )}
            </span>
          </button>
          <button type="button" aria-label={`Close and open ${item.label}`} onClick={openSection} className="-mr-1.5 ml-auto flex size-9 items-center justify-center rounded-full hover:bg-white/10">
            <X aria-hidden className="size-6" />
          </button>
        </div>

        {story ? (
          // A tap anywhere skips to the section's page (owner 2026-10-10); a long press only pauses.
          <div
            role="button"
            tabIndex={0}
            aria-label={account ? "Next story" : `Open ${item.label}`}
            draggable={false}
            {...hold}
            onClick={() => {
              if (!holdWasLong.current) (account ? skip : openSection)();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                (account ? skip : openSection)();
              }
            }}
            className="relative flex min-h-0 flex-1 cursor-pointer touch-none flex-col justify-end select-none [-webkit-touch-callout:none]"
          >
            <img
              src={story.coverUrl}
              alt=""
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(true)}
              draggable={false}
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black via-black/70 to-transparent" />
            <span className="relative flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] text-white sm:pb-5">
              <span className="font-wide text-xl font-black leading-tight sm:line-clamp-3 sm:text-[1.375rem] sm:leading-[1.15]">{story.title}</span>
              {story.excerpt && (
                <span className="hidden text-sm leading-relaxed text-white/80 sm:line-clamp-2">{story.excerpt}</span>
              )}
              {/* Read more (owner 2026-10-10): the story itself; the tap stays off the "open the section" tap around it. */}
              <Link
                href={`/a/${story.slug}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                className="sr-only sm:not-sr-only sm:order-last sm:mt-1 sm:inline-flex sm:h-11 sm:w-full sm:items-center sm:justify-center sm:rounded-full sm:bg-white sm:text-[0.9375rem] sm:font-bold sm:text-ink sm:transition-colors sm:hover:bg-white/90"
              >
                Read more
              </Link>
              {/* Phones: swipe up to read the whole story — a bouncing arrow in the middle shows it. */}
              <span aria-hidden className="order-last flex flex-col items-center gap-0.5 self-center pt-2 text-xs font-bold tracking-wide text-white/90 sm:hidden">
                <ChevronUp className="size-6 animate-bounce" strokeWidth={2.5} />
                Swipe up to read
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Avatar src={story.author.image} name={story.author.name} size="sm" decorative />
                <span className="font-semibold">{story.author.name}</span>
              </span>
            </span>
          </div>
        ) : null}
        {story ? null : (
          <div className="flex flex-1 items-center justify-center">
            <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
