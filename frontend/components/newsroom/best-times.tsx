"use client";

import { CalendarClock } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { NewsroomBestTimes } from "@/lib/shared/contracts";
import { ChartCard } from "./audience-charts";
import { BarChart, ChartTable } from "./charts";
import { hourLabel, hourRangeLabel, WEEKDAYS, WEEKDAYS_SHORT } from "./format";

const plural = (n: number) => `${formatNumber(n)} ${n === 1 ? "engagement" : "engagements"}`;

/** Short hour ticks every 6 hours ("12a", "6a", "12p", "6p"). */
function hourTick(hour: number): string {
  if (hour % 6 !== 0) return "";
  const label = hourLabel(hour);
  return label.replace(" AM", "a").replace(" PM", "p");
}

/**
 * Best time to publish (SPEC §3.11): when your readers engage (views + likes + shares over 90 days,
 * in your time zone) — by hour of day and by weekday, best slots in brand red, plus a plain-language verdict.
 * Falls back to platform-wide engagement until you have enough of your own.
 */
export function BestTimes({ data, dimmed }: { data: NewsroomBestTimes; dimmed?: boolean }) {
  const hours = new Set(data.bestHours);
  const days = new Set(data.bestDays);
  const verdict = data.best ? `${WEEKDAYS[data.best.day]}s, ${hourRangeLabel(data.best.hour)}` : null;

  return (
    <ChartCard
      headingId="newsroom-best-times"
      title="Best time to publish"
      icon={<CalendarClock aria-hidden />}
      description={`Last 90 days · ${data.timeZone.replace(/_/g, " ")} time`}
      className={dimmed ? "opacity-60 transition-opacity" : "transition-opacity"}
    >
      <div className="px-2 sm:px-1">
        <div className="panel-tint px-4 py-3.5">
          {verdict ? (
            <p className="font-wide text-lg font-extrabold leading-snug text-ink">
              <span className="text-brand">{verdict}</span>
            </p>
          ) : (
            <p className="font-wide text-base font-extrabold text-ink">Not enough readers yet to call it</p>
          )}
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
            {data.basis === "you"
              ? `Based on ${plural(data.sample)} with your stories. Publish shortly before your readers peak.`
              : "Based on readers across WebNEWS until your own stories have 30 or more engagements — then it's all about your audience."}
          </p>
        </div>

        <h3 className="kicker mt-5 text-muted">By hour of day</h3>
        <BarChart
          className="mt-2"
          values={data.byHour}
          highlight={hours}
          tickLabel={hourTick}
          titleFor={(i) => hourRangeLabel(i)}
          rowsFor={(i) => [{ label: "engagements", value: formatNumber(data.byHour[i] ?? 0) }]}
          ariaLabel={`Engagement by hour of day. Best hours: ${data.bestHours.map(hourRangeLabel).join(", ") || "none yet"}`}
          announce={(i) => `${hourRangeLabel(i)}: ${plural(data.byHour[i] ?? 0)}`}
        />
        <ChartTable
          caption="Engagement by hour of day"
          columns={["Hour", "Engagements"]}
          rows={data.byHour.map((value, i) => [`${hourRangeLabel(i)}${hours.has(i) ? " ★" : ""}`, formatNumber(value)])}
        />

        <h3 className="kicker mt-6 text-muted">By day of week</h3>
        <BarChart
          className="mt-2"
          height={150}
          values={data.byDay}
          highlight={days}
          tickLabel={(i) => WEEKDAYS_SHORT[i] ?? ""}
          titleFor={(i) => WEEKDAYS[i] ?? ""}
          rowsFor={(i) => [{ label: "engagements", value: formatNumber(data.byDay[i] ?? 0) }]}
          ariaLabel={`Engagement by weekday. Best days: ${data.bestDays.map((d) => WEEKDAYS[d]).join(", ") || "none yet"}`}
          announce={(i) => `${WEEKDAYS[i]}: ${plural(data.byDay[i] ?? 0)}`}
        />
        <ChartTable
          caption="Engagement by day of week"
          columns={["Day", "Engagements"]}
          rows={data.byDay.map((value, i) => [`${WEEKDAYS[i]}${days.has(i) ? " ★" : ""}`, formatNumber(value)])}
        />
      </div>
    </ChartCard>
  );
}
