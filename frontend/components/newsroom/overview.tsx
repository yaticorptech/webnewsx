"use client";

import { ArrowDownRight, ArrowUpRight, Eye, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatNumber } from "@/lib/format";
import type { NewsroomKpi, NewsroomSeries, NewsroomStory, NewsroomSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChartTable, LineChart } from "./charts";
import { formatDelta, seriesDayLabel } from "./format";
import { storyHref } from "./stories-table";

/*
 * Analytics-pro overview (owner 2026-10-14, "professional dashboard", like YouTube Studio): one card whose top row is the
 * KPI strip — each number is a tab that switches the large chart under it — then a side column with the top stories and
 * where the stories stand. Neutral surfaces; red only marks the chosen metric and the line.
 */

type Metric = "views" | "reads" | "likes" | "shares" | "followers";

const METRICS: { key: Metric; label: string; noun: [string, string]; hint: string }[] = [
  { key: "views", label: "Views", noun: ["view", "views"], hint: "Readers who saw your stories in a feed or opened them" },
  { key: "reads", label: "Reads", noun: ["read", "reads"], hint: "Readers who opened the full story page" },
  { key: "likes", label: "Likes", noun: ["like", "likes"], hint: "Hearts on your stories" },
  { key: "shares", label: "Shares", noun: ["share", "shares"], hint: "Times readers shared your stories" },
  { key: "followers", label: "Followers", noun: ["new follower", "new followers"], hint: "People who started following you" },
];

const plural = (n: number, [one, many]: [string, string]) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export function Overview({ summary, series, dimmed = false }: { summary: NewsroomSummary; series: NewsroomSeries; dimmed?: boolean }) {
  const [metric, setMetric] = useState<Metric>("views");
  const meta = METRICS.find((m) => m.key === metric)!;
  const period = `previous ${summary.range} days`;
  // Followers: the running total (growth); the rest: per day.
  const valueAt = (i: number) => {
    const p = series.points[i]!;
    return metric === "followers" ? p.followersTotal : p[metric];
  };
  const points = series.points.map((p, i) => ({ label: seriesDayLabel(p.date), value: valueAt(i) }));

  return (
    <section aria-label={`Your numbers for the last ${summary.range} days`} className={cn("card overflow-hidden transition-opacity", dimmed && "opacity-60")}>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m) => {
          const active = m.key === metric;
          const kpi = summary.kpis[m.key];
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              title={m.hint}
              onClick={() => setMetric(m.key)}
              className={cn(
                "relative flex min-w-0 flex-col items-start gap-1 px-4 py-3.5 text-left transition-colors sm:px-5 sm:py-4",
                // Five tabs: on phones the last one spans the row.
                "max-sm:last:col-span-2",
                active ? "bg-surface" : "bg-surface-2 hover:bg-surface",
              )}
            >
              {active && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand" />}
              <span className={cn("text-xs font-bold uppercase tracking-[0.06em]", active ? "text-ink" : "text-muted")}>{m.label}</span>
              <span className="font-wide text-2xl font-black leading-tight tracking-[-0.02em] text-ink sm:text-[1.75rem]">
                <NumberTicker value={kpi.value} format="plain" countUp />
              </span>
              <Delta kpi={kpi} period={period} />
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-4 pt-4 sm:px-5">
        <p className="mb-2 px-2 text-[0.8125rem] text-muted">
          {metric === "followers"
            ? `${plural(summary.kpis.followers.value, meta.noun)} in the last ${series.range} days · total followers per day`
            : `${plural(summary.kpis[metric].value, meta.noun)} in the last ${series.range} days · per day`}
        </p>
        <LineChart
          points={points}
          height={240}
          animationKey={`${metric}-${series.range}`}
          dimmed={dimmed}
          titleFor={(i) => seriesDayLabel(series.points[i]!.date, true)}
          rowsFor={(i) => {
            const p = series.points[i]!;
            if (metric === "followers") {
              return [
                { label: "followers", value: formatNumber(p.followersTotal) },
                { label: "new that day", value: `+${formatNumber(p.followers)}` },
              ];
            }
            const rows = (["views", "reads", "likes", "shares"] as const).map((key) => ({ key, label: key, value: formatNumber(p[key]) }));
            return [...rows.filter((r) => r.key === metric), ...rows.filter((r) => r.key !== metric)];
          }}
          emptyMessage={metric === "followers" ? "No followers yet — keep publishing" : `No ${meta.noun[1]} in the last ${series.range} days yet`}
          ariaLabel={`${meta.label} per day, last ${series.range} days`}
          announce={(i) => `${seriesDayLabel(series.points[i]!.date, true)}: ${formatNumber(valueAt(i))} ${meta.label.toLowerCase()}`}
        />
        <ChartTable
          caption={`Views, reads, likes, shares and followers per day, last ${series.range} days`}
          columns={["Day", "Views", "Reads", "Likes", "Shares", "Followers"]}
          rows={[...series.points].reverse().map((p) => [
            seriesDayLabel(p.date, true),
            formatNumber(p.views),
            formatNumber(p.reads),
            formatNumber(p.likes),
            formatNumber(p.shares),
            formatNumber(p.followersTotal),
          ])}
          className="px-2"
        />
      </div>
    </section>
  );
}

/** "▲ 12% vs previous 7 days" — green up, red down, grey when flat or nothing to compare. */
function Delta({ kpi, period }: { kpi: NewsroomKpi; period: string }) {
  if (kpi.delta === null || Math.round(Math.abs(kpi.delta) * 100) === 0) {
    return <span className="text-xs font-semibold text-muted">{kpi.delta === null && kpi.value > 0 ? "New" : "No change"}</span>;
  }
  const up = kpi.delta > 0;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-bold tabular-nums", up ? "text-success-strong" : "text-brand")}
      title={`vs the ${period} (${kpi.previous.toLocaleString("en-US")})`}
    >
      {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
      {formatDelta(kpi.delta)}
      <span className="sr-only"> vs the {period}</span>
    </span>
  );
}

/** Side column: the 5 most-viewed stories (lifetime) and where your stories stand. */
export function TopStories({ stories, totals }: { stories: NewsroomStory[]; totals: NewsroomSummary["totals"] }) {
  const top = stories
    .filter((s) => s.status === "published" || s.status === "hidden")
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);
  const max = Math.max(1, ...top.map((s) => s.viewCount));
  return (
    <section aria-labelledby="newsroom-top" className="card flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="newsroom-top" className="flex items-center gap-2 font-wide text-base font-extrabold text-ink">
          <Trophy aria-hidden className="size-4.5 text-brand" />
          Top stories
        </h2>
        <span className="text-xs font-semibold text-muted">All time · views</span>
      </header>
      {top.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">Your most-read stories show up here.</p>
      ) : (
        <ol className="flex flex-col">
          {top.map((story, i) => (
            <li key={story.id} className="border-b border-border last:border-b-0">
              <Link href={storyHref(story)} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                <span className="w-4 shrink-0 text-center text-sm font-black tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[0.8125rem] font-bold leading-snug text-ink group-hover:text-brand">{story.title || "Untitled"}</span>
                  <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-brand/70" style={{ width: `${(story.viewCount / max) * 100}%` }} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums text-ink-2">
                  <Eye aria-hidden className="size-3.5 text-muted" />
                  {formatNumber(story.viewCount)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <dl className="mt-auto grid grid-cols-3 divide-x divide-border border-t border-border bg-surface-2/50 text-center">
        {[
          ["Live", totals.published],
          ["In review", totals.inReview],
          ["Returned", totals.returned],
        ].map(([label, value]) => (
          <div key={label} className="px-2 py-3">
            <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted">{label}</dt>
            <dd className="mt-0.5 font-wide text-lg font-black text-ink">{formatNumber(value as number)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
