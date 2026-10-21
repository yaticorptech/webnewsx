"use client";

import { Clock3, Eye, Heart, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMetered } from "@/components/auth/read-meter";
import { FREE_CARDS } from "@/components/auth/read-wall";
import { SpeedLines } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { TRENDING_PAGE_SIZE } from "@/lib/config";
import { compactNumber } from "@/lib/format";
import type { TrendingHeadline } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { hasIndicScript, INDIC_HEADLINE } from "./script";
import { useTrending } from "./trending-card";

/**
 * /trending body: a pink header panel and the ranked list in a white card (big red rank numbers,
 * headline, byline and live counts) in the feed's reading column. Seeded by the server, then kept
 * live: counts move with `article.stats`, deleted stories drop out, the ranking refreshes every minute.
 */
export function TrendingList({ initial }: { initial: TrendingHeadline[] }) {
  const { data } = useTrending(TRENDING_PAGE_SIZE, initial);
  // Logged out (owner 2026-10-08): the top ten only, like the ten free stories elsewhere.
  const gated = useMetered();
  const items = (data?.items ?? initial).slice(0, gated ? FREE_CARDS : undefined);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <header className="panel-tint relative isolate overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
        <SpeedLines variant="bars" className="pointer-events-none absolute -right-6 -bottom-8 -z-10 w-36 opacity-[0.07] sm:w-48" />
        <p className="kicker flex items-center gap-2 text-brand">
          <PulseDot size="xs" />
          Trending now
        </p>
        <h1
          id="trending-heading"
          className="mt-3 font-wide text-[clamp(1.75rem,1.3rem+1.6vw,2.375rem)] font-black leading-[1.05] tracking-[-0.02em] text-ink"
        >
          Top stories of the last 24 hours
        </h1>
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-ink-2">
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          Ranked by what readers viewed, liked and shared today. The order refreshes every minute; counts move live.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          kicker="Trending"
          title="Nothing trending yet"
          description="Stories people read, like and share today rank here. Start with the latest ones."
          action={<Button href="/?tab=latest">Read the latest</Button>}
        />
      ) : (
        <ol aria-label="Trending stories" className="card divide-y divide-border overflow-hidden">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout="position"
                exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                className="animate-fade-up overflow-hidden"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <TrendingStoryRow item={item} rank={index + 1} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

function TrendingStoryRow({ item, rank }: { item: TrendingHeadline; rank: number }) {
  return (
    <Link
      href={`/a/${item.slug}`}
      data-trending-rank={rank}
      data-trending-story={item.id}
      className="group grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 px-4 py-4 -outline-offset-2 transition-colors duration-200 hover:bg-tint sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4 sm:px-6 sm:py-5"
    >
      <span aria-hidden className="pt-0.5 font-wide text-[2rem] font-black leading-none tracking-[-0.04em] text-brand tabular-nums sm:text-[2.5rem]">
        {rank}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{`Number ${rank}: `}</span>
        <span
          className={cn(
            "line-clamp-3 font-wide text-[1.0625rem] font-extrabold leading-tight tracking-[-0.005em] text-ink transition-colors duration-200 group-hover:text-brand sm:text-lg",
            hasIndicScript(item.title) && INDIC_HEADLINE,
          )}
        >
          {item.title}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold text-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            <UserHandle username={item.author.username} truncate className="font-bold text-ink-2" />
            {item.author.reporterLevel === "verified" && <VerifiedBadge size={15} focusable={false} />}
          </span>
          <TimeAgo date={item.publishedAt} className="whitespace-nowrap" />
          <span className="flex items-center gap-2.5">
            <Count icon={<Eye aria-hidden />} value={item.viewCount} noun="view" />
            <Count icon={<Heart aria-hidden />} value={item.likeCount} noun="like" />
            <Count icon={<Share2 aria-hidden />} value={item.shareCount} noun="share" />
          </span>
        </span>
      </span>
    </Link>
  );
}

function Count({ icon, value, noun }: { icon: ReactNode; value: number; noun: string }) {
  const word = value === 1 ? noun : `${noun}s`;
  return (
    <span className="flex shrink-0 items-center gap-1 [&_svg]:size-3.5" title={`${value.toLocaleString("en-US")} ${word}`}>
      {icon}
      <span className="tabular-nums">{compactNumber(value)}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
}
