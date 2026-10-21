"use client";

import { motion, useReducedMotion } from "motion/react";
import { TRAINEE_APPROVALS_TO_VERIFY } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type ReviewProgressProps = {
  approved: number;
  required?: number;
  /** Tighter layout for the profile header strip. */
  compact?: boolean;
  className?: string;
};

/**
 * Trainee → Verified progress (SPEC §3.11): one segment per approval the Review Desk still needs,
 * filling crimson in sequence. Announced as a meter.
 */
export function ReviewProgress({ approved, required = TRAINEE_APPROVALS_TO_VERIFY, compact = false, className }: ReviewProgressProps) {
  const reduce = useReducedMotion();
  const done = Math.min(approved, required);
  const left = Math.max(0, required - done);

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("font-bold text-ink", compact ? "text-xs" : "text-sm")}>
          Review Desk <span className="text-muted">·</span>{" "}
          <span className="tabular-nums text-brand">
            {done} of {required}
          </span>{" "}
          approved
        </p>
        {!compact && (
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
            {left === 0 ? "Verified next" : `${left} to go`}
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label="Approved stories towards Verified"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${required} stories approved`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${required}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: required }, (_, index) => (
          <span key={index} className={cn("relative overflow-hidden rounded-full bg-tint-3", compact ? "h-1.5" : "h-2")}>
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-brand"
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: index < done ? 1 : 0 }}
              transition={{ delay: reduce ? 0 : 0.2 + index * 0.18, duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
            />
          </span>
        ))}
      </div>
      {!compact && (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          {left === 0
            ? "The Review Desk has approved your stories — your Verified badge is on its way."
            : `As a Trainee, each story you submit goes to the Review Desk first. ${left} more approved ${left === 1 ? "story makes" : "stories make"} you Verified — then you publish instantly.`}
        </p>
      )}
    </div>
  );
}
