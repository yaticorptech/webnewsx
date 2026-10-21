"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, Heart, RotateCcw, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { RailCard } from "@/components/layout/rail-card";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { TrendingHeadline } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

const LIMIT = 5;
/** The ranking itself (24h engagement) is refreshed periodically; counts update live in between. */
const REFRESH_MS = 60_000;

type TrendingData = { items: TrendingHeadline[] };

/**
 * The "Trending now" ranking (top stories by 24h engagement) with live counts (realtime
 * `article.stats`, kept in this query's own data), deleted stories removed at once and a re-rank
 * every minute. Shared by the rail card (5) and the /trending page (20, server-seeded).
 */
export function useTrending(limit: number, initialItems?: TrendingHeadline[]) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.trending(limit),
    queryFn: ({ signal }) => api.trending(limit, signal),
    staleTime: REFRESH_MS / 2,
    refetchInterval: REFRESH_MS,
    initialData: initialItems ? { items: initialItems } : undefined,
  });

  // Counts live in this query's own data (not the shared per-article stats cache: seeding that from
  // a client fetch could race feed cards that are still hydrating with server-rendered counts).
  useRealtimeEvent("article.stats", ({ id, viewCount, likeCount, shareCount }) => {
    queryClient.setQueryData<TrendingData>(qk.trending(limit), (prev) =>
      prev && prev.items.some((item) => item.id === id)
        ? { items: prev.items.map((item) => (item.id === id ? { ...item, viewCount, likeCount, shareCount } : item)) }
        : prev,
    );
  });
  useRealtimeEvent("article.deleted", ({ id }) => {
    queryClient.setQueryData<TrendingData>(qk.trending(limit), (prev) =>
      prev && prev.items.some((item) => item.id === id) ? { items: prev.items.filter((item) => item.id !== id) } : prev,
    );
  });
  useRealtimeReconnect(() => void queryClient.invalidateQueries({ queryKey: qk.trending(limit) }));
  return query;
}

/**
 * Right-rail "Trending now" (SPEC §3.4b): the top 5 stories by engagement in the last 24 hours,
 * crimson rank numbers, compact live counts, re-ranked every minute, deleted stories removed live,
 * and a "See all" link to the full /trending page.
 */
export function TrendingCard(): React.JSX.Element {
  const { data, isPending, isError, refetch, isRefetching } = useTrending(LIMIT);

  const items = data?.items ?? [];

  return (
    <RailCard
      title="Trending now"
      icon={<TrendingUp aria-hidden />}
      aside={<span className="text-kicker font-bold uppercase tracking-[0.12em] text-muted">Last 24h</span>}
    >
      {isPending ? (
        <TrendingSkeleton />
      ) : isError && items.length === 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-muted">
          <p>Couldn&apos;t load trending stories.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-semibold text-brand hover:bg-tint disabled:opacity-60"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm leading-relaxed text-muted">
          Nothing trending yet. Stories people read, like and share today rank here.
        </p>
      ) : (
        <ol className="divide-y divide-border" aria-label="Trending stories">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout="position"
                // A story entering the ranking (owner 2026-10-15): fades in and zooms in, a touch past full size, then settles.
                initial={{ opacity: 0, height: 0, scale: 0.88 }}
                animate={{ opacity: 1, height: "auto", scale: [0.88, 1.04, 1] }}
                exit={{ opacity: 0, height: 0, scale: 0.92 }}
                transition={{
                  default: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] },
                  scale: { duration: 0.6, times: [0, 0.6, 1], ease: "easeOut" },
                }}
                style={{ transformOrigin: "50% 50%" }}
                className="overflow-hidden"
              >
                <TrendingRow item={item} rank={index + 1} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      <Link
        href="/trending"
        className="group flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-[0.8125rem] font-bold text-brand -outline-offset-2 transition-colors hover:bg-tint hover:text-brand-hover"
      >
        See all trending stories
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
      </Link>
    </RailCard>
  );
}

function TrendingRow({ item, rank }: { item: TrendingHeadline; rank: number }) {
  return (
    <Link
      href={`/a/${item.slug}`}
      data-trending-item={item.id}
      className={cn(
        "group grid grid-cols-[1.75rem_1fr] gap-x-2.5 px-5 py-3 -outline-offset-2 transition-colors hover:bg-tint",
        // The newest story (owner 2026-10-14): a red border.
        item.newest && "m-2 rounded-xl px-3 ring-2 ring-brand ring-inset",
      )}
    >
      <span aria-hidden className="font-wide text-2xl leading-none font-black text-brand tabular-nums">
        {rank}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{`Number ${rank}: `}</span>
        {item.newest && (
          <span className="mb-1 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-brand-contrast">
            Latest
          </span>
        )}
        <span className="line-clamp-2 text-sm leading-snug font-bold text-ink transition-colors group-hover:text-brand">
          {item.title}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2.5 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-1">
            <UserHandle username={item.author.username} truncate />
            {/* The finished badge, still (owner 2026-10-08): at this size the animation's red-bars stage looked broken. */}
            {item.author.reporterLevel === "verified" && <VerifiedBadge size={14} animate={false} focusable={false} />}
          </span>
          <Count icon={<Eye aria-hidden className="size-3.5" />} value={item.viewCount} noun="view" />
          <Count icon={<Heart aria-hidden className="size-3.5" />} value={item.likeCount} noun="like" />
        </span>
      </span>
    </Link>
  );
}

function Count({ icon, value, noun }: { icon: React.ReactNode; value: number; noun: string }) {
  const word = value === 1 ? noun : `${noun}s`;
  return (
    <span className="flex shrink-0 items-center gap-1" title={`${value.toLocaleString("en-US")} ${word}`}>
      {icon}
      <span className="tabular-nums">{compactNumber(value)}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
}

function TrendingSkeleton() {
  return (
    <ol aria-busy="true" aria-label="Loading trending stories" className="divide-y divide-border">
      {Array.from({ length: LIMIT }, (_, i) => (
        <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-2.5 px-5 py-3">
          <Skeleton className="h-6 w-4" />
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="mt-0.5 h-3 w-1/2" />
          </span>
        </li>
      ))}
    </ol>
  );
}
