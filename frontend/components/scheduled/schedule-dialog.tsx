"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SCHEDULE_LIMITS, scheduleError } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** `YYYY-MM-DDTHH:mm` in the device's time zone (what a datetime-local input takes). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const formatScheduled = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** One-tap times (owner 2026-11-06), each only while it is still ahead. */
function quickTimes(now: Date): { label: string; at: Date }[] {
  const at = (days: number, hours: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hours, 0, 0, 0);
    return d;
  };
  const inHour = new Date(now.getTime() + 60 * 60_000);
  inHour.setSeconds(0, 0);
  const options = [
    { label: "In 1 hour", at: inHour },
    { label: "Today 6 PM", at: at(0, 18) },
    { label: "Today 9 PM", at: at(0, 21) },
    { label: "Tomorrow 7 AM", at: at(1, 7) },
    { label: "Tomorrow 6 PM", at: at(1, 18) },
  ];
  return options.filter((o) => !scheduleError(o.at, now.getTime()));
}

/**
 * "Schedule" (owner 2026-11-06): pick when a story / birthday wish / invitation goes live — a one-tap time or any date
 * and time up to SCHEDULE_LIMITS.maxAheadDays ahead. `onConfirm` gets the ISO time and does the saving.
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  what,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "story", "birthday wish", "invitation". */
  what: string;
  onConfirm: (iso: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Each time it opens: today's quick times, and an hour from now to start from.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const current = new Date();
      setNow(current);
      setError(null);
      setValue((v) => v || toLocalInput(new Date(current.getTime() + 60 * 60_000)));
    }
  }

  const chosen = value ? new Date(value) : null;
  const confirm = async () => {
    const issue = chosen ? scheduleError(chosen) : "Pick a date and time";
    if (issue || !chosen) {
      setError(issue);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(chosen.toISOString());
    } finally {
      setBusy(false);
    }
  };

  const min = toLocalInput(new Date(now.getTime() + SCHEDULE_LIMITS.minAheadMinutes * 60_000));
  const max = toLocalInput(new Date(now.getTime() + SCHEDULE_LIMITS.maxAheadDays * 86_400_000));
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={`Schedule ${what}`}
      description="It goes live on its own at this time — your followers get the notification then."
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} loading={busy} leftIcon={<CalendarClock aria-hidden />}>
            Schedule
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick times">
          {quickTimes(now).map((option) => {
            const on = value === toLocalInput(option.at);
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setValue(toLocalInput(option.at));
                  setError(null);
                }}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                  on ? "border-brand bg-tint text-brand" : "border-border text-ink hover:border-border-strong",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Date and time
          <input
            type="datetime-local"
            value={value}
            min={min}
            max={max}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            className={cn(
              "h-11 rounded-xl border bg-surface px-3 text-base font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              error ? "border-brand" : "border-border",
            )}
          />
        </label>
        <p className={cn("text-sm", error ? "font-semibold text-brand" : "text-muted")} role={error ? "alert" : undefined}>
          {error ?? (chosen && !Number.isNaN(chosen.getTime()) ? `Goes live ${formatScheduled(chosen.toISOString())}` : " ")}
        </p>
      </div>
    </Modal>
  );
}
