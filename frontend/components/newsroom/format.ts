import { FOR_YOU_WINDOW_DAYS, type SpotlightOrder, type SpotlightStatus } from "@/lib/shared/contracts";

/** Spotlight is sold for your own live stories inside the For You window (shared with the backend). */
export const SPOTLIGHT_WINDOW_DAYS = FOR_YOU_WINDOW_DAYS;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** 249 → "₹249", 1499 → "₹1,499". */
export function formatInr(value: number): string {
  return inr.format(value);
}

/** 6 → "6 hours", 24 → "1 day", 72 → "3 days". */
export function durationLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** 0.3306 → "33%", 0.041 → "4.1%", 0 → "0%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  const pct = ratio * 100;
  return `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`;
}

/** Signed delta for a KPI tile: 0.124 → "+12%", -0.08 → "−8%". */
export function formatDelta(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct === 0) return "0%";
  return `${delta > 0 ? "+" : "−"}${pct.toLocaleString("en-US")}%`;
}

/** Is the story still inside the Spotlight window? */
export function spotlightEligible(publishedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!publishedAt) return false;
  const published = Date.parse(publishedAt);
  return Number.isFinite(published) && now - published < SPOTLIGHT_WINDOW_DAYS * 24 * 3_600_000;
}

/** Pending or running — a story can hold only one such order at a time. */
export function isOpenOrder(order: Pick<SpotlightOrder, "status" | "active">): boolean {
  return order.status === "pending" || (order.status === "granted" && order.active);
}

/** Display state of an order: granted orders whose time is up read as "expired". */
export type SpotlightState = "pending" | "active" | "expired" | "declined" | "cancelled";

export function spotlightState(order: { status: SpotlightStatus; active: boolean }): SpotlightState {
  if (order.status === "granted") return order.active ? "active" : "expired";
  return order.status;
}

/** "18h 12m left", "42m left", "Ending now". */
export function timeLeft(endsAt: string, now: number): string {
  const ms = Date.parse(endsAt) - now;
  if (!Number.isFinite(ms) || ms <= 60_000) return "Ending now";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}

const shortDateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Sep 24, 9:05 PM" in the reader's zone — call on the client only (or behind useMounted). */
export function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : shortDateTime.format(date);
}

/** "Sep 24" in the reader's zone — client only. */
export function formatShortDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : shortDay.format(date);
}

/** "2026-09-24" (a series day, already local to the series' zone) → "Sep 24" / "Thu, Sep 24". Zone-free. */
export function seriesDayLabel(day: string, withWeekday = false): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withWeekday ? { weekday: "short" as const } : {}),
  }).format(date);
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** 0 → "12 AM", 13 → "1 PM". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? "AM" : "PM"}`;
}

/** 13 → "1–2 PM", 23 → "11 PM–12 AM". */
export function hourRangeLabel(hour: number): string {
  const start = hourLabel(hour);
  const end = hourLabel(hour + 1);
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
}
