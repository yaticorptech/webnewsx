"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type Ref } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { useLiveHeadlines } from "@/lib/hooks/use-live-headlines";
import type { Headline } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { DatelineClock } from "./dateline-clock";

export type TickerProps = {
  /** Server-loaded latest headlines (GET /api/feed/headlines). */
  initial: Headline[];
  /** Max headlines kept in the strip. */
  max?: number;
};

/** Marquee speed in px/s. */
const SPEED = 55;

/**
 * Breaking bar under the masthead, like the owner's previous platform: a rounded pink bar with a
 * crimson "● LIVE" pill and a marquee of the latest headlines. New stories are prepended in
 * realtime (the loop restarts so they're visible at once, with a flash). Always scrolls — the owner wants no pause
 * button; it only pauses while hovered/focused so a headline can be clicked, and runs slower under reduced motion.
 * Phones show the clock first.
 */
/** Gap kept between a focused headline and the edge of the strip (room for its focus ring). */
const FOCUS_EDGE = 6;

/**
 * Keyboard focus on a headline that the marquee has carried (partly) out of the strip: jump the animation to
 * where that headline is fully visible. The strip is paused while it holds focus (CSS :focus-within) and
 * resumes from the new spot afterwards, so the focus ring is never hidden (WCAG 2.4.7 / 2.4.11).
 */
function revealFocusedHeadline(event: FocusEvent<HTMLDivElement>, track: HTMLDivElement | null): void {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (!link || !track) return;
  const animation = track.getAnimations()[0];
  const loop = track.scrollWidth / 2; // the track holds two copies and slides by one copy per loop
  const duration = Number(animation?.effect?.getComputedTiming().duration);
  if (!animation || loop <= 0 || !Number.isFinite(duration) || duration <= 0) return;
  const view = event.currentTarget.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  let shift = 0;
  if (box.left < view.left + FOCUS_EDGE) shift = view.left + FOCUS_EDGE - box.left;
  else if (box.right > view.right - FOCUS_EDGE) shift = Math.max(view.right - FOCUS_EDGE - box.right, view.left + FOCUS_EDGE - box.left);
  if (shift === 0) return;
  const offset = track.getBoundingClientRect().left - view.left; // current translateX (0 … -loop)
  const next = Math.min(0, Math.max(-loop + 1, offset + shift));
  animation.currentTime = (-next / loop) * duration;
}

export function Ticker({ initial, max = 12 }: TickerProps) {
  const { items, freshIds, lastInsertAt } = useLiveHeadlines(initial, max);
  const groupRef = useRef<HTMLUListElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  // Duration proportional to content width so the reading speed stays constant.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const update = () => setDuration(Math.max(18, Math.round(group.scrollWidth / SPEED)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(group);
    return () => observer.disconnect();
  }, [items.length]);

  const empty = items.length === 0;

  return (
    <section aria-label="Live headlines" className="relative z-30">
      <div className="mx-auto max-w-300 px-4 pt-3 sm:px-6 lg:pt-4">
        <div className="flex h-(--ticker-h) items-stretch overflow-hidden rounded-xl border border-tint-3 bg-tint-2">
          {/* Phones: a compact clock and LIVE badge so the headlines keep most of the strip (owner 2026-09-25). */}
          <DatelineClock
            variant="time"
            className="shrink-0 border-r border-tint-3 pl-2.5 pr-2 md:hidden"
            timeClassName="text-[0.625rem] tracking-[0.04em]"
          />
          <p className="relative z-10 flex shrink-0 items-center pl-1.5 pr-0.5 md:pl-2.5 md:pr-1">
            <span className="kicker inline-flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 text-[0.5625rem] tracking-[0.08em] text-white shadow-[0_1px_2px_rgb(227_6_19/0.3)] sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[0.6875rem] sm:tracking-[0.14em]">
              <PulseDot size="xs" tone="white" />
              Live
            </span>
          </p>

          {empty ? (
            <p className="flex min-w-0 flex-1 items-center truncate px-3 text-[0.8125rem] font-semibold text-muted">
              Stories hit this wire the moment they&apos;re published.
            </p>
          ) : (
            <div
              // overflow-clip, not -hidden: a hidden box is still a scroll container, and focusing a headline would
              // scroll it sideways under the moving track; revealFocusedHeadline positions the track instead.
              className="marquee no-scrollbar relative min-w-0 flex-1 overflow-clip mask-fade-x @container has-focus-visible:mask-none"
              onFocus={(event) => revealFocusedHeadline(event, trackRef.current)}
            >
              <div
                key={lastInsertAt}
                ref={trackRef}
                className="marquee-track h-full"
                style={duration ? ({ "--marquee-duration": `${duration}s` } as CSSProperties) : undefined}
              >
                <HeadlineGroup ref={groupRef} items={items} freshIds={freshIds} />
                <HeadlineGroup items={items} freshIds={freshIds} duplicate />
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}

function HeadlineGroup({
  items,
  freshIds,
  duplicate = false,
  ref,
}: {
  items: Headline[];
  freshIds: ReadonlySet<string>;
  duplicate?: boolean;
  ref?: Ref<HTMLUListElement>;
}) {
  return (
    <ul
      ref={ref}
      aria-hidden={duplicate || undefined}
      className={cn("flex h-full min-w-[100cqw] shrink-0 items-center", duplicate && "marquee-dup")}
    >
      {items.map((item) => (
        <li key={item.id} className="flex h-full items-center">
          <Link
            href={`/a/${item.slug}`}
            tabIndex={duplicate ? -1 : undefined}
            className={cn(
              "group flex h-full items-center gap-2.5 whitespace-nowrap px-5 text-[0.8125rem] font-semibold text-ink -outline-offset-3 sm:px-7",
              freshIds.has(item.id) && "animate-flash-highlight",
            )}
          >
            {/* Red on white, not on the pink bar (red on #FCF2F2 is only 4.4:1 at this size). */}
            <TimeAgo date={item.publishedAt} variant="short" className="rounded-md bg-surface px-1.5 py-0.5 text-[0.6875rem] font-extrabold text-brand-strong" />
            <span className="decoration-brand decoration-2 underline-offset-4 transition-colors group-hover:text-brand-strong group-hover:underline">
              {item.title}
            </span>
          </Link>
          <SpeedBarsSvg className="h-2 w-auto text-tint-border" />
        </li>
      ))}
    </ul>
  );
}
