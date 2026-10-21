"use client";

import type { ReactNode } from "react";
import { PulseDot } from "@/components/ui/pulse-dot";
import { datelineParts } from "@/lib/format";
import { useClock } from "@/lib/hooks/use-clock";
import { cn } from "@/lib/utils";

export type DatelineClockProps = {
  /**
   * `full` (≥1024px) "THU, 24 SEP 2026 · 12:48:05 PM IST" · `short` (768–1023px) "24 SEP · 12:48 PM" ·
   * `time` (<768px) "12:48 PM".
   */
  variant?: "full" | "short" | "time";
  /** Show the heartbeat dot. Off by default — the owner wants the dateline without it. */
  dot?: boolean;
  className?: string;
  /** Extra classes for the time text (e.g. a tighter size in the phone ticker). */
  timeClassName?: string;
};

/** Width-reserving placeholders (server + hydration render) so nothing shifts when the clock mounts. */
const PLACEHOLDER = {
  full: "WED, 30 SEP 2026 · 12:00:00 PM GMT",
  short: "30 SEP · 12:00 PM",
  time: "12:00 PM",
} as const;

/**
 * Live newspaper dateline in the reader's timezone (SPEC §3.2). Ticks every second while the tab is
 * visible; rendered only on the client (placeholder first — no hydration mismatch). Not a live
 * region, so screen readers aren't interrupted every second; `<time dateTime>` carries the value.
 */
export function DatelineClock({ variant = "full", dot = false, className, timeClassName }: DatelineClockProps) {
  const now = useClock();
  const parts = now === null ? null : datelineParts(now);

  let content: ReactNode;
  if (!parts) {
    content = <span className="invisible">{PLACEHOLDER[variant]}</span>;
  } else if (variant === "full") {
    content = (
      <>
        <span>{parts.date}</span>
        <span aria-hidden className="text-muted-2">
          ·
        </span>
        <span className="text-ink">{parts.timeWithSeconds}</span>
        <span>{parts.zone}</span>
      </>
    );
  } else if (variant === "short") {
    content = (
      <>
        <span>{parts.shortDate}</span>
        <span aria-hidden className="text-muted-2">
          ·
        </span>
        <span className="text-ink">{parts.time}</span>
      </>
    );
  } else {
    content = <span className="text-ink">{parts.time}</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      {dot && <PulseDot size="xs" tone="bright" />}
      <time
        dateTime={now === null ? undefined : new Date(now).toISOString()}
        className={cn(
          "inline-flex items-center gap-[0.45em] text-[0.6875rem] font-bold uppercase tabular-nums tracking-[0.12em] text-muted font-wide",
          timeClassName,
        )}
      >
        {content}
      </time>
    </span>
  );
}
