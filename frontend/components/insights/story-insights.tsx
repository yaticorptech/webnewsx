"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Clock3, Eye, Heart, MousePointerClick, Share2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BackButton } from "@/components/layout/back-button";
import { EmptyNote, Panel, SimpleTable, StatTile, useShowMore } from "@/components/memberships/dashboard-parts";
import { LineChart } from "@/components/newsroom/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { ActionCount, StoryInsights } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Newsroom → Insights (owner 2026-10-16: "every button's data shown to the publisher, like Meta Ads"): one story's
 * reach, the funnel from shown to followed, a daily chart, every button readers pressed on it, who saw it and where it
 * was shared.
 */

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const LONG_DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });
const dayLabel = (date: string, long = false) => (long ? LONG_DAY : DAY).format(new Date(`${date}T00:00:00`));
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const duration = (seconds: number | null) =>
  seconds === null ? "—" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

type Metric = "views" | "reads" | "likes" | "shares";
const METRICS: { key: Metric; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "reads", label: "Opens" },
  { key: "likes", label: "Likes" },
  { key: "shares", label: "Shares" },
];

export function StoryInsightsView({ id }: { id: string }) {
  const insights = useQuery({ queryKey: ["newsroom", "insights", id], queryFn: ({ signal }) => api.newsroom.insights(id, signal) });
  return (
    <div data-grid-page="" data-own-back="" className="w-full pb-12">
      <div className="mb-5 flex items-center gap-2">
        <BackButton fallback="/newsroom" />
        <h1 className="font-wide text-xl font-extrabold text-ink">Story insights</h1>
      </div>
      {insights.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : insights.isError ? (
        <p className="card px-5 py-8 text-center text-sm text-muted">{errorMessage(insights.error)}</p>
      ) : (
        <Dashboard data={insights.data} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: StoryInsights }) {
  const { story, totals, funnel } = data;
  const engagements = totals.likes + totals.comments + totals.shares + totals.saves;
  return (
    <div className="flex flex-col gap-5">
      {/* The story */}
      <section className="card flex items-center gap-4 p-4">
        <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {story.coverUrl && <img src={story.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold leading-snug text-ink">{story.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {story.publishedAt && <span>Published {dayLabel(story.publishedAt.slice(0, 10), true)}</span>}
            {story.spotlight && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-brand">
                <Sparkles aria-hidden className="size-3" /> Spotlighted now
              </span>
            )}
          </p>
        </div>
        {story.slug && (
          <Link href={`/a/${story.slug}`} className="shrink-0 text-sm font-bold text-brand hover:text-brand-hover">
            View story →
          </Link>
        )}
      </section>

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Reach" value={formatNumber(totals.views)} hint="Readers who saw it" icon={<Eye aria-hidden />} tone="brand" />
        <StatTile label="Opens" value={formatNumber(totals.reads)} hint={`${percent(totals.reads, totals.views)} open rate`} icon={<BookOpenText aria-hidden />} />
        <StatTile label="Avg. read time" value={duration(totals.avgReadSeconds)} hint="On the story page" icon={<Clock3 aria-hidden />} />
        <StatTile label="Engagements" value={formatNumber(engagements)} hint="Likes, comments, shares, saves" icon={<Heart aria-hidden />} />
        <StatTile label="Shares" value={formatNumber(totals.shares)} hint={`${formatNumber(totals.saves)} saves`} icon={<Share2 aria-hidden />} />
        <StatTile label="Button taps" value={formatNumber(totals.clicks)} hint="Every tap on this story" icon={<MousePointerClick aria-hidden />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Daily data={data} />
        <Panel title="Funnel">
          <Funnel
            steps={[
              { label: "Shown", hint: "Saw the card", value: funnel.shown },
              { label: "Opened", hint: "Opened the story", value: funnel.opened },
              { label: "Engaged", hint: "Liked, commented, shared or saved", value: funnel.engaged },
              { label: "Followed", hint: "Followed you after reading", value: funnel.followed },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Every button readers pressed">
          <Actions actions={data.actions} />
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel title="Audience">
            <Split
              rows={[
                { label: "Signed in", value: data.audience.signedIn },
                { label: "Visitors", value: data.audience.visitors },
              ]}
            />
            <div className="mt-4">
              <Split
                rows={[
                  { label: "WebNEWS app", value: data.audience.app },
                  { label: "Website", value: data.audience.web },
                ]}
              />
            </div>
          </Panel>
          <Panel title="Shares by channel">
            {data.shareChannels.length === 0 ? (
              <EmptyNote>No shares yet.</EmptyNote>
            ) : (
              <Split rows={data.shareChannels.map((c) => ({ label: channelName(c.channel), value: c.count }))} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

const channelName = (channel: string) => channel.charAt(0).toUpperCase() + channel.slice(1).replace(/[_-]/g, " ");

function Daily({ data }: { data: StoryInsights }) {
  const [metric, setMetric] = useState<Metric>("views");
  const label = METRICS.find((m) => m.key === metric)!.label;
  return (
    <Panel
      title="Day by day"
      aside={
        <div role="tablist" aria-label="Metric" className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-bold", metric === m.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      <LineChart
        points={data.daily.map((d) => ({ label: dayLabel(d.date), value: d[metric] }))}
        titleFor={(i) => dayLabel(data.daily[i]!.date, true)}
        rowsFor={(i) => {
          const d = data.daily[i]!;
          return [
            { label, value: formatNumber(d[metric]), strong: true },
            ...METRICS.filter((m) => m.key !== metric).map((m) => ({ label: m.label, value: formatNumber(d[m.key]) })),
          ];
        }}
        ariaLabel={`${label} per day`}
        announce={(i) => `${dayLabel(data.daily[i]!.date, true)}: ${formatNumber(data.daily[i]![metric])} ${label.toLowerCase()}`}
        animationKey={metric}
        emptyMessage={`No ${label.toLowerCase()} yet`}
      />
    </Panel>
  );
}

function Funnel({ steps }: { steps: { label: string; hint: string; value: number }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1]!.value : null;
        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold text-ink">{step.label}</span>
              <span className="tabular-nums">
                <strong className="font-extrabold text-ink">{formatNumber(step.value)}</strong>
                {previous !== null && <span className="ml-1.5 text-xs text-muted">{percent(step.value, previous)} of previous</span>}
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(step.value / top) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Actions({ actions }: { actions: ActionCount[] }) {
  const { shown, more } = useShowMore(actions);
  if (actions.length === 0) return <EmptyNote>No taps recorded yet — they show here as readers use the story.</EmptyNote>;
  const top = Math.max(...actions.map((a) => a.count), 1);
  return (
    <>
    <SimpleTable head={["Button", "Taps", "People"]}>
      {shown.map((action) => (
        <tr key={action.label}>
          <td className="px-4 py-2.5">
            <span className="block font-semibold text-ink">{action.label}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-brand/70" style={{ width: `${(action.count / top) * 100}%` }} />
            </span>
          </td>
          <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{formatNumber(action.count)}</td>
          <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{formatNumber(action.people)}</td>
        </tr>
      ))}
    </SimpleTable>
    {more}
    </>
  );
}

/** Rows with a share bar each. */
export function Split({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-ink">{row.label}</span>
            <span className="tabular-nums text-ink">
              <strong className="font-extrabold">{formatNumber(row.value)}</strong>
              <span className="ml-1.5 text-xs text-muted">{percent(row.value, total)}</span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ink/70" style={{ width: total > 0 ? `${(row.value / total) * 100}%` : "0%" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
