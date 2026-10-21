"use client";

import { formatDate, shortTimeAgo, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

export type TimeAgoProps = {
  /** ISO string / epoch / Date. */
  date: string | number | Date;
  /** `long` → "3m ago" · `short` → "3m". */
  variant?: "long" | "short";
  className?: string;
};

/**
 * Relative time that stays fresh (shared 30s clock). Renders an empty <time> on the server and
 * during hydration — relative labels and the local-time tooltip depend on the reader's clock and
 * timezone, so computing them server-side would cause hydration mismatches.
 */
export function TimeAgo({ date, variant = "long", className }: TimeAgoProps) {
  const now = useNow();
  const iso = date instanceof Date ? date.toISOString() : typeof date === "number" ? new Date(date).toISOString() : date;
  const label = now === null ? "" : variant === "short" ? shortTimeAgo(date, now) : timeAgo(date, now);
  return (
    <time
      dateTime={iso}
      title={now === null ? undefined : formatDate(date, "date-time")}
      className={cn("inline-block min-w-[1.5ch] tabular-nums", className)}
    >
      {label}
    </time>
  );
}
