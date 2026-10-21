"use client";

import { BookOpenText, Eye, FileText, Heart, Share2, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import type { NewsroomKpi, NewsroomSeriesPoint, NewsroomSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";
import { formatDelta } from "./format";

type Metric = "views" | "reads" | "likes" | "shares" | "followers";

const TILES: { key: Metric; label: string; icon: ReactNode; hint: string }[] = [
  { key: "views", label: "Views", icon: <Eye aria-hidden />, hint: "Readers who saw your stories in a feed or opened them" },
  { key: "reads", label: "Reads", icon: <BookOpenText aria-hidden />, hint: "Readers who opened the full story page" },
  { key: "likes", label: "Likes", icon: <Heart aria-hidden />, hint: "Hearts on your stories" },
  { key: "shares", label: "Shares", icon: <Share2 aria-hidden />, hint: "Times readers shared your stories" },
  { key: "followers", label: "New followers", icon: <UserPlus aria-hidden />, hint: "People who started following you" },
];

export type KpiTilesProps = {
  summary: NewsroomSummary;
  points: NewsroomSeriesPoint[];
  dimmed?: boolean;
};

/**
 * Stat tiles (value · delta vs the previous period of the same length · sparkline), plus a
 * "Stories" tile with what's live, in review and returned. 2 columns on phones, 3 from 640px.
 */
export function KpiTiles({ summary, points, dimmed = false }: KpiTilesProps) {
  const period = `previous ${summary.range} days`;
  return (
    <ul
      aria-label={`Your numbers for the last ${summary.range} days`}
      className={cn("grid grid-cols-2 gap-3 transition-opacity duration-300 sm:grid-cols-3 min-[1400px]:grid-cols-6", dimmed && "opacity-60")}
    >
      {TILES.map((tile, i) => (
        <motion.li
          key={tile.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
          data-kpi={tile.key}
          className="card group relative flex min-w-0 flex-col p-4 transition-[border-color,box-shadow] duration-200 hover:border-tint-border hover:shadow-md sm:p-5"
          title={tile.hint}
        >
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted [&_svg]:size-3.5 [&_svg]:text-brand">
            {tile.icon}
            {tile.label}
          </p>
          <p className="mt-2 font-wide text-[1.625rem] font-black leading-none tracking-[-0.02em] text-ink sm:text-[1.875rem]">
            <NumberTicker value={summary.kpis[tile.key].value} format="plain" countUp />
          </p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <DeltaChip kpi={summary.kpis[tile.key]} period={period} />
            <Sparkline values={points.map((p) => p[tile.key])} className="max-[359px]:hidden" />
          </div>
        </motion.li>
      ))}
      <motion.li
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: TILES.length * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
        data-kpi="stories"
        className="panel-tint relative flex min-w-0 flex-col p-4 sm:p-5"
      >
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted [&_svg]:size-3.5 [&_svg]:text-brand">
          <FileText aria-hidden />
          Stories live
        </p>
        <p className="mt-2 font-wide text-[1.625rem] font-black leading-none tracking-[-0.02em] text-ink sm:text-[1.875rem]">
          <NumberTicker value={summary.totals.published} format="plain" countUp />
        </p>
        <p className="mt-3 text-xs font-semibold leading-snug text-ink-2">
          {summary.totals.inReview} in review · {summary.totals.returned} returned
        </p>
      </motion.li>
    </ul>
  );
}

/** Signed change vs the previous period: up = green ▲, down = red ▼, never colour alone. */
export function DeltaChip({ kpi, period }: { kpi: NewsroomKpi; period: string }) {
  const base = "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-bold tabular-nums [&_svg]:size-3.5";
  if (kpi.delta === null) {
    return kpi.value > 0 ? (
      <span className={cn(base, "bg-tint text-brand")} title={`Nothing in the ${period}`}>
        New
        <span className="sr-only"> — nothing in the {period}</span>
      </span>
    ) : (
      <span className={cn(base, "bg-surface-2 text-muted")} title={`No activity in this or the ${period}`}>
        —<span className="sr-only">No change</span>
      </span>
    );
  }
  const up = kpi.delta > 0;
  const flat = Math.round(Math.abs(kpi.delta) * 100) === 0;
  return (
    <span
      className={cn(base, flat ? "bg-surface-2 text-muted" : up ? "bg-success-soft text-success-strong" : "bg-surface text-brand ring-1 ring-inset ring-tint-border")}
      title={`${formatDelta(kpi.delta)} vs the ${period} (${kpi.previous.toLocaleString("en-US")})`}
    >
      {!flat && (up ? <TrendingUp aria-hidden /> : <TrendingDown aria-hidden />)}
      {formatDelta(kpi.delta)}
      <span className="sr-only"> vs the {period}</span>
    </span>
  );
}
