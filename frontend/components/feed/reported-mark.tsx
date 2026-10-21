"use client";

import { Flag } from "lucide-react";
import { FLAG_REASON_LABELS, type FlagReason } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { useReportedReason } from "./flag-dialog";

export type ReportedMarkProps = {
  article: { id: string; viewer?: { reported?: FlagReason | null } };
  className?: string;
};

/**
 * "You reported this" (owner 2026-09-30): the reader who reported a story sees it — with their reason — until the
 * Editor Desk has decided. Nobody else sees it. Only on the story page (owner 2026-10-07: no mark on the feed's cards).
 */
export function ReportedMark({ article, className }: ReportedMarkProps) {
  const reason = useReportedReason(article);
  if (!reason) return null;
  const label = FLAG_REASON_LABELS[reason];
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-brand/30 bg-tint px-4 py-3 text-sm leading-snug text-ink-2",
        className,
      )}
    >
      <Flag aria-hidden className="mt-0.5 size-4 shrink-0 fill-brand text-brand" strokeWidth={2.25} />
      <span>
        <strong className="font-bold text-brand-strong">You reported this story</strong> for {label.toLowerCase()}. The Editor Desk is
        reviewing it.
      </span>
    </p>
  );
}
