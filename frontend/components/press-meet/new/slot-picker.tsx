"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Moon, Sun, Sunrise } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET_DURATIONS, istDateKey, istMinutes, type PressMeetDuration, type PressMeetSlot } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { durationLabel, meetDayLong, meetTime, monthLabel } from "../format";

export type ChosenSlot = { start: string; end: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Step 1 — when (owner 2026-10-01): the length (30 / 60 / 90 minutes), a month calendar (days with free times; full
 * and out-of-range days greyed) and that day's start times. A time that overlaps one of your own press meets shows
 * "Booked" (others' press meets don't block it — owner 2026-10-02). Times are India time.
 */
export function SlotPicker({
  duration,
  onDuration,
  month,
  onMonth,
  date,
  onDate,
  slot,
  onSlot,
}: {
  duration: PressMeetDuration;
  onDuration: (value: PressMeetDuration) => void;
  month: string;
  onMonth: (value: string) => void;
  date: string | null;
  onDate: (value: string) => void;
  slot: ChosenSlot | null;
  onSlot: (value: ChosenSlot) => void;
}) {
  const calendar = useQuery({
    queryKey: qk.pressMeetCalendar(month, duration),
    queryFn: ({ signal }) => api.pressMeets.calendar(month, duration, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const slots = useQuery({
    queryKey: qk.pressMeetSlots(date ?? "", duration),
    queryFn: ({ signal }) => api.pressMeets.slots(date!, duration, signal),
    enabled: date !== null,
    refetchInterval: 30_000,
  });

  const [today] = useState(() => istDateKey(Date.now()));
  const first = calendar.data?.firstDate ?? today;
  const last = calendar.data?.lastDate ?? today;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const leading = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const openByDate = new Map(calendar.data?.days.map((day) => [day.date, day.open]) ?? []);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="pm-length" className="flex flex-col gap-3">
        <h2 id="pm-length" className="text-sm font-bold text-ink">
          How long?
        </h2>
        <div role="radiogroup" aria-labelledby="pm-length" className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-1.5 sm:max-w-md">
          {PRESS_MEET_DURATIONS.map((value) => {
            const active = value === duration;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onDuration(value)}
                className={cn(
                  "relative h-11 rounded-xl text-sm font-bold font-wide transition-colors",
                  active ? "text-brand-contrast" : "text-ink-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pm-duration"
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-brand shadow-[0_1px_2px_rgb(227_6_19/0.3)]"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="relative">{durationLabel(value)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* Calendar */}
        <section aria-label="Choose a date" className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onMonth(shiftMonth(month, -1))}
              disabled={month <= first.slice(0, 7)}
              aria-label="Previous month"
              className="flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint hover:text-brand disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <p className="font-wide text-base font-extrabold text-ink" aria-live="polite">
              {monthLabel(month)}
            </p>
            <button
              type="button"
              onClick={() => onMonth(shiftMonth(month, 1))}
              disabled={month >= last.slice(0, 7)}
              aria-label="Next month"
              className="flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint hover:text-brand disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="pb-1 text-[0.6875rem] font-bold uppercase tracking-wider text-muted">
                {day}
              </span>
            ))}
            {Array.from({ length: leading }, (_, i) => (
              <span key={`blank-${i}`} aria-hidden />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const key = `${month}-${String(i + 1).padStart(2, "0")}`;
              const open = openByDate.get(key) ?? 0;
              const inRange = key >= first && key <= last;
              const full = inRange && calendar.data !== undefined && open === 0;
              const disabled = !inRange || full || calendar.data === undefined;
              const selected = key === date;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onDate(key)}
                  aria-pressed={selected}
                  aria-label={`${meetDayLong(`${key}T06:30:00Z`)}${full ? ", fully booked" : inRange ? `, ${open} free times` : ""}`}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-bold tabular-nums transition-colors",
                    selected
                      ? "bg-brand text-brand-contrast shadow-[0_6px_16px_-6px_rgb(227_6_19/0.6)]"
                      : disabled
                        ? "text-muted-2/70"
                        : "text-ink hover:bg-tint hover:text-brand",
                    key === today && !selected && "ring-1 ring-inset ring-brand/50",
                  )}
                >
                  <span className={cn(full && "line-through decoration-1")}>{i + 1}</span>
                  {inRange && !full && calendar.data && (
                    <span aria-hidden className={cn("absolute bottom-1.5 size-1 rounded-full", selected ? "bg-white" : open > 4 ? "bg-success" : "bg-brand")} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted">
            <Legend dot="bg-success">Many free times</Legend>
            <Legend dot="bg-brand">Few left</Legend>
            <Legend>
              <span className="font-bold line-through">12</span> Fully booked
            </Legend>
          </div>
          {calendar.isError && <p className="mt-3 text-sm text-brand">Couldn&rsquo;t load the calendar. {errorMessage(calendar.error)}</p>}
        </section>

        {/* Times */}
        <section aria-labelledby="pm-times" className="card flex min-h-64 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pm-times" className="font-wide text-base font-extrabold text-ink">
              {date ? meetDayLong(`${date}T06:30:00Z`) : "Choose a date"}
            </h2>
            <span className="text-xs font-semibold text-muted">India time (IST) · {durationLabel(duration)}</span>
          </div>
          {date === null ? (
            <EmptyTimes>Pick a day on the calendar to see the free times.</EmptyTimes>
          ) : slots.isPending ? (
            <div aria-hidden className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="h-14 animate-pulse rounded-xl bg-skeleton" />
              ))}
            </div>
          ) : slots.isError ? (
            <EmptyTimes>Couldn&rsquo;t load the times. {errorMessage(slots.error)}</EmptyTimes>
          ) : (
            <SlotGroups slots={slots.data.slots} chosen={slot} onChoose={onSlot} />
          )}
        </section>
      </div>
    </div>
  );
}

function Legend({ dot, children }: { dot?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />}
      {children}
    </span>
  );
}

function EmptyTimes({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted">
      <span className="flex size-12 items-center justify-center rounded-full bg-tint text-brand">
        <CalendarClock aria-hidden className="size-5.5" />
      </span>
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

const GROUPS = [
  { key: "morning", label: "Morning", icon: Sunrise, test: (min: number) => min < 12 * 60 },
  { key: "afternoon", label: "Afternoon", icon: Sun, test: (min: number) => min >= 12 * 60 && min < 17 * 60 },
  { key: "evening", label: "Evening", icon: Moon, test: (min: number) => min >= 17 * 60 },
] as const;

function SlotGroups({ slots, chosen, onChoose }: { slots: PressMeetSlot[]; chosen: ChosenSlot | null; onChoose: (slot: ChosenSlot) => void }) {
  // Times already started aren't offered; booked ones stay, struck out.
  const visible = slots.filter((s) => s.reason !== "past");
  if (!visible.some((s) => s.available)) {
    return <EmptyTimes>No free times left on this day for this length. Try a shorter press meet or another day.</EmptyTimes>;
  }
  return (
    <div className="mt-4 flex flex-col gap-5">
      {GROUPS.map((group) => {
        const items = visible.filter((s) => group.test(istMinutes(s.start)));
        if (items.length === 0) return null;
        const Icon = group.icon;
        return (
          <div key={group.key} className="flex flex-col gap-2.5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <Icon aria-hidden className="size-3.5" />
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((s) => {
                const selected = chosen?.start === s.start;
                return (
                  <button
                    key={s.start}
                    type="button"
                    disabled={!s.available}
                    aria-pressed={selected}
                    onClick={() => onChoose({ start: s.start, end: s.end })}
                    className={cn(
                      "flex h-14 flex-col items-center justify-center rounded-xl border text-center transition-[border-color,background-color,color,box-shadow]",
                      selected
                        ? "border-brand bg-brand text-brand-contrast shadow-[0_6px_16px_-6px_rgb(227_6_19/0.6)]"
                        : s.available
                          ? "border-border-strong bg-surface text-ink hover:border-brand hover:text-brand"
                          : "cursor-not-allowed border-dashed border-border bg-surface-2 text-muted-2",
                    )}
                  >
                    <span className={cn("text-sm font-bold tabular-nums", !s.available && "line-through")}>{meetTime(s.start)}</span>
                    <span className={cn("text-[0.6875rem] font-semibold", selected ? "text-white/85" : "text-muted")}>
                      {s.available ? `to ${meetTime(s.end)}` : "Booked"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Times that overlap one of your press meets show as booked.
      </p>
    </div>
  );
}
