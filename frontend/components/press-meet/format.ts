import { PRESS_MEET, type PressMeetInvite, type PressMeetSummary } from "@/lib/shared/contracts";

/*
 * Press meet times are always shown in India time (the calendar is IST), whatever the device's own zone.
 */

const TZ = PRESS_MEET.timeZone;
const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const DAY_LONG = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const MONTH = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

/** "3:00 PM" */
export function meetTime(iso: string): string {
  return TIME.format(new Date(iso)).toUpperCase();
}

/** "Sat, 4 Oct" */
export function meetDay(iso: string): string {
  return DAY.format(new Date(iso));
}

/** "Saturday, 4 October 2026" */
export function meetDayLong(iso: string): string {
  return DAY_LONG.format(new Date(iso));
}

/** "3:00 – 4:00 PM" (both halves when they differ: "11:30 AM – 12:30 PM"). */
export function meetRange(start: string, end: string): string {
  const a = meetTime(start);
  const b = meetTime(end);
  const [aTime, aHalf] = a.split(" ");
  const [, bHalf] = b.split(" ");
  return aHalf === bHalf ? `${aTime} – ${b}` : `${a} – ${b}`;
}

/** "October 2026" for "2026-10". */
export function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

export function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** "45 min", "1 hr", "1 hr 30 min" */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export type Tone = "brand" | "live" | "success" | "muted" | "warn";

/** The press meet's state as a chip: Live · Upcoming · Ended · Not held · Cancelled. */
export function meetStatusChip(meet: Pick<PressMeetSummary, "status" | "startedAt">): { label: string; tone: Tone } {
  switch (meet.status) {
    case "live":
      return { label: "Live now", tone: "live" };
    case "scheduled":
      return { label: "Upcoming", tone: "brand" };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" };
    default:
      return meet.startedAt ? { label: "Ended", tone: "muted" } : { label: "Not held", tone: "muted" };
  }
}

/**
 * Where a reporter's invitation stands, in one chip — what's next for them (reporter view) or for the organizer.
 */
export function inviteStage(
  invite: PressMeetInvite,
  meet: Pick<PressMeetSummary, "status" | "startedAt">,
  viewer: "organizer" | "reporter",
): { label: string; tone: Tone } {
  if (invite.status === "declined") return { label: "Declined", tone: "muted" };
  if (invite.status === "invited") {
    if (meet.status === "cancelled" || meet.status === "ended") return { label: "No response", tone: "muted" };
    return viewer === "reporter" ? { label: "Respond", tone: "warn" } : { label: "Awaiting reply", tone: "warn" };
  }
  if (meet.status === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (meet.status !== "ended") return { label: "Accepted", tone: "success" };
  if (!meet.startedAt) return { label: "Not held", tone: "muted" };
  if (invite.payment === "received") return { label: "Paid", tone: "success" };
  if (invite.payment === "released") return viewer === "reporter" ? { label: "Confirm payment", tone: "warn" } : { label: "Payment sent", tone: "brand" };
  // A free seat (public press meet, owner 2026-10-07): verified is the end of it — no fee to release.
  if (invite.review === "approved" && invite.price === 0) return { label: "Published", tone: "success" };
  if (invite.review === "approved") return viewer === "reporter" ? { label: "Verified · payment due", tone: "success" } : { label: "Release payment", tone: "warn" };
  if (invite.review === "pending") return viewer === "reporter" ? { label: "Under review", tone: "brand" } : { label: "Review story", tone: "warn" };
  if (invite.review === "changes") return viewer === "reporter" ? { label: "Changes requested", tone: "warn" } : { label: "Changes asked", tone: "brand" };
  return viewer === "reporter" ? { label: "Send your story", tone: "warn" } : { label: "Awaiting story", tone: "muted" };
}

export const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-tint text-brand ring-1 ring-inset ring-tint-border",
  live: "bg-brand text-brand-contrast",
  success: "bg-success-soft text-success-strong",
  muted: "bg-surface-2 text-muted ring-1 ring-inset ring-border",
  warn: "bg-brand-soft text-brand ring-1 ring-inset ring-brand/30",
};

const PARTS = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** The date tile's lines in India time: { weekday: "Mon", day: "5", month: "Oct", year: "2026" }. */
export function meetDateParts(iso: string): { weekday: string; day: string; month: string; year: string } {
  const parts = PARTS.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month"), year: get("year") };
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-05": the India-time calendar day (for "Today" / "This month" filters). */
export function istDayKey(date: Date | string): string {
  return IST_DAY.format(typeof date === "string" ? new Date(date) : date);
}
