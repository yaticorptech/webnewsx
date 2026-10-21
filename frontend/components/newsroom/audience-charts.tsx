"use client";

import { LineChart as LineChartIcon, Users } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import type { NewsroomSeries } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChartTable, LineChart } from "./charts";
import { seriesDayLabel } from "./format";

type AudienceMetric = "views" | "reads" | "engagement";

const METRICS: { key: AudienceMetric; label: string; noun: [string, string] }[] = [
  { key: "views", label: "Views", noun: ["view", "views"] },
  { key: "reads", label: "Reads", noun: ["read", "reads"] },
  { key: "engagement", label: "Engagement", noun: ["like or share", "likes + shares"] },
];

const plural = (n: number, [one, many]: [string, string]) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export function ChartCard({
  title,
  icon,
  aside,
  description,
  children,
  className,
  headingId,
}: {
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn("card overflow-hidden", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 font-wide text-base font-extrabold tracking-[-0.005em] text-ink">
            <span className="flex text-brand [&_svg]:size-4.5">{icon}</span>
            {title}
          </h2>
          {description && <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="px-3 pb-4 pt-4 sm:px-5">{children}</div>
    </section>
  );
}

/** Segmented control (buttons with aria-pressed); the active pill slides between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1 ring-1 ring-border ring-inset">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full font-bold transition-colors duration-150 max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 max-md:after:content-['']",
              size === "md" ? "h-9 px-4 text-sm" : "h-8 px-3 text-[0.8125rem]",
              active ? "text-brand-contrast" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-brand shadow-[0_2px_8px_-2px_rgb(227_6_19/0.45)]"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Views & engagement per day": one series at a time (Views · Reads · Engagement), same axis, table twin. */
export function AudienceChart({ series, dimmed }: { series: NewsroomSeries; dimmed?: boolean }) {
  const [metric, setMetric] = useState<AudienceMetric>("views");
  const meta = METRICS.find((m) => m.key === metric)!;
  const valueOf = (i: number) => {
    const p = series.points[i]!;
    return metric === "engagement" ? p.likes + p.shares : p[metric];
  };
  const points = series.points.map((p, i) => ({ label: seriesDayLabel(p.date), value: valueOf(i) }));
  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <ChartCard
      headingId="newsroom-audience"
      title="Views & engagement"
      icon={<LineChartIcon aria-hidden />}
      description={`${plural(total, meta.noun)} in the last ${series.range} days · per day`}
      aside={
        <Segmented
          label="Metric"
          options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <LineChart
        points={points}
        animationKey={`${metric}-${series.range}`}
        dimmed={dimmed}
        titleFor={(i) => seriesDayLabel(series.points[i]!.date, true)}
        rowsFor={(i) => {
          const p = series.points[i]!;
          const rows = [
            { key: "views", label: "views", value: formatNumber(p.views) },
            { key: "reads", label: "reads", value: formatNumber(p.reads) },
            { key: "likes", label: "likes", value: formatNumber(p.likes) },
            { key: "shares", label: "shares", value: formatNumber(p.shares) },
          ];
          if (metric === "engagement") {
            return [{ label: "likes + shares", value: formatNumber(p.likes + p.shares) }, ...rows.filter((r) => r.key === "views" || r.key === "reads")];
          }
          // The plotted metric first.
          return [...rows.filter((r) => r.key === metric), ...rows.filter((r) => r.key !== metric)];
        }}
        emptyMessage={`No ${meta.noun[1]} in the last ${series.range} days yet`}
        ariaLabel={`${meta.label} per day, last ${series.range} days`}
        announce={(i) => `${seriesDayLabel(series.points[i]!.date, true)}: ${plural(valueOf(i), meta.noun)}`}
      />
      <ChartTable
        caption={`Views, reads, likes and shares per day, last ${series.range} days`}
        columns={["Day", "Views", "Reads", "Likes", "Shares"]}
        rows={[...series.points].reverse().map((p) => [
          seriesDayLabel(p.date, true),
          formatNumber(p.views),
          formatNumber(p.reads),
          formatNumber(p.likes),
          formatNumber(p.shares),
        ])}
        className="px-2"
      />
    </ChartCard>
  );
}

/** Follower growth: running total per day; the tooltip adds that day's new followers. */
export function FollowerChart({ series, dimmed }: { series: NewsroomSeries; dimmed?: boolean }) {
  const points = series.points.map((p) => ({ label: seriesDayLabel(p.date), value: p.followersTotal }));
  const gained = series.points.reduce((sum, p) => sum + p.followers, 0);
  const total = series.points[series.points.length - 1]?.followersTotal ?? 0;
  return (
    <ChartCard
      headingId="newsroom-followers"
      title="Follower growth"
      icon={<Users aria-hidden />}
      description={`${formatNumber(total)} ${total === 1 ? "follower" : "followers"} · ${gained > 0 ? `+${formatNumber(gained)}` : "no new followers"} in the last ${series.range} days`}
    >
      <LineChart
        points={points}
        height={180}
        animationKey={`followers-${series.range}`}
        dimmed={dimmed}
        titleFor={(i) => seriesDayLabel(series.points[i]!.date, true)}
        rowsFor={(i) => {
          const p = series.points[i]!;
          return [
            { label: "followers", value: formatNumber(p.followersTotal) },
            { label: "new that day", value: `+${formatNumber(p.followers)}` },
          ];
        }}
        emptyMessage="No followers yet — keep publishing"
        ariaLabel={`Followers at the end of each day, last ${series.range} days`}
        announce={(i) => {
          const p = series.points[i]!;
          return `${seriesDayLabel(p.date, true)}: ${formatNumber(p.followersTotal)} followers, ${formatNumber(p.followers)} new`;
        }}
      />
      <ChartTable
        caption={`Followers per day, last ${series.range} days`}
        columns={["Day", "Followers", "New"]}
        rows={[...series.points].reverse().map((p) => [seriesDayLabel(p.date, true), formatNumber(p.followersTotal), `+${formatNumber(p.followers)}`])}
        className="px-2"
      />
    </ChartCard>
  );
}
