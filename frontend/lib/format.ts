/**
 * Display formatting shared by server and client. Everything uses the fixed "en-US" locale so
 * server and client output match; time-relative values should be rendered through
 * <TimeAgo /> (components/ui/time-ago.tsx), which re-renders on the client.
 */

type DateInput = string | number | Date;

const toDate = (input: DateInput): Date => (input instanceof Date ? input : new Date(input));

const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const plainFormatter = new Intl.NumberFormat("en-US");

/** 999 → "999", 1234 → "1.2K", 15300 → "15.3K", 2_500_000 → "2.5M". */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return String(Math.round(value));
  return compactFormatter.format(value);
}

/** 1234567 → "1,234,567". */
export function formatNumber(value: number): string {
  return Number.isFinite(value) ? plainFormatter.format(value) : "0";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthDayYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const longDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function calendarFallback(date: Date, now: number): string {
  return date.getFullYear() === new Date(now).getFullYear() ? monthDay.format(date) : monthDayYear.format(date);
}

/** "just now", "3m ago", "5h ago", "2d ago", then "Sep 3" / "Sep 3, 2025". */
export function timeAgo(input: DateInput, now: number = Date.now()): string {
  const date = toDate(input);
  const diff = now - date.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 45_000) return "just now";
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return calendarFallback(date, now);
}

/** Compact variant for tickers and rails: "now", "3m", "5h", "2d", "Sep 3". */
export function shortTimeAgo(input: DateInput, now: number = Date.now()): string {
  const date = toDate(input);
  const diff = now - date.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return calendarFallback(date, now);
}

export type DateStyle = "short" | "long" | "month-year" | "date-time";

/** "short" → "Sep 24, 2026" · "long" → "September 24, 2026" · "month-year" → "September 2026" · "date-time" → "Sep 24, 2026, 9:05 AM". */
export function formatDate(input: DateInput, style: DateStyle = "short"): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "";
  switch (style) {
    case "long":
      return longDate.format(date);
    case "month-year":
      return monthYear.format(date);
    case "date-time":
      return dateTime.format(date);
    default:
      return monthDayYear.format(date);
  }
}

/** True when `input` is less than `withinMs` old (default 1h) — drives the "fresh" pulse dot. */
export function isFresh(input: DateInput, withinMs: number = HOUR, now: number = Date.now()): boolean {
  const age = now - toDate(input).getTime();
  return age >= 0 && age < withinMs;
}

/** "1 min read" / "4 min read". */
export function readingTimeLabel(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} min read`;
}

/** Singular/plural helper: pluralize(1, "follower") → "1 follower". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${compactNumber(count)} ${count === 1 ? singular : plural}`;
}

/* ─────────────────────────── Dateline clock (masthead, SPEC §3.2) ─────────────────────────── */

export type DatelineParts = {
  /** "THU, 24 SEP 2026" */
  date: string;
  /** "24 SEP" */
  shortDate: string;
  /** "12:48:05 PM" */
  timeWithSeconds: string;
  /** "12:48 PM" */
  time: string;
  /** "IST", "CEST", "EDT" … or a GMT offset when the zone has no common abbreviation. */
  zone: string;
};

const datelineDate = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const datelineTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

/** Short zone name for the reader's timezone; prefers a letter abbreviation (en-IN knows "IST"). */
function zoneName(date: Date): string {
  const pick = (locale: string) =>
    new Intl.DateTimeFormat(locale, { timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
  const us = pick("en-US");
  if (/^[A-Z]{2,5}$/.test(us)) return us;
  const intl = pick("en-IN");
  return /^[A-Z]{2,5}$/.test(intl) ? intl : us;
}

/** Newspaper dateline pieces in the reader's local timezone (call on the client only). */
export function datelineParts(input: DateInput): DatelineParts {
  const date = toDate(input);
  const parts = Object.fromEntries(datelineDate.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  const day = parts.day ?? "";
  const month = (parts.month ?? "").toUpperCase();
  const timeWithSeconds = datelineTime.format(date);
  return {
    date: `${(parts.weekday ?? "").toUpperCase()}, ${day} ${month} ${parts.year ?? ""}`,
    shortDate: `${day} ${month}`,
    timeWithSeconds,
    time: timeWithSeconds.replace(/:\d{2}(?=\s)/, ""),
    zone: zoneName(date),
  };
}
