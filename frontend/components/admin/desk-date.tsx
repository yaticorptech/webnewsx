"use client";

import { useMounted } from "@/lib/hooks/use-mounted";

const FORMATS = {
  date: { month: "short", day: "numeric", year: "numeric" },
  "date-time": { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const utc = {
  date: new Intl.DateTimeFormat("en-US", { ...FORMATS.date, timeZone: "UTC" }),
  "date-time": new Intl.DateTimeFormat("en-US", { ...FORMATS["date-time"], timeZone: "UTC", timeZoneName: "short" }),
};
const local = {
  date: new Intl.DateTimeFormat("en-US", FORMATS.date),
  "date-time": new Intl.DateTimeFormat("en-US", FORMATS["date-time"]),
};

/**
 * Absolute date in the viewer's timezone. Server + hydration render UTC (identical markup on both
 * sides), then it switches to local time after mount — no hydration mismatch.
 */
export function DeskDate({ iso, style = "date", className }: { iso: string; style?: keyof typeof FORMATS; className?: string }) {
  const mounted = useMounted();
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={iso} className={className}>
      {(mounted ? local : utc)[style].format(date)}
    </time>
  );
}
