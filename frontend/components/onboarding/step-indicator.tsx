"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type StepIndicatorProps = {
  steps: readonly { key: string; label: string }[];
  current: number;
  /** Furthest step reached — earlier steps (and this one) are clickable. */
  reached: number;
  onSelect: (index: number) => void;
  className?: string;
};

/**
 * "01 Byline — 02 Photo & bio — 03 Terms": rounded progress bars that fill crimson as you advance. Visited steps are buttons; the current one has aria-current="step".
 */
export function StepIndicator({ steps, current, reached, onSelect, className }: StepIndicatorProps) {
  return (
    <nav aria-label="Profile setup progress" className={className}>
      <ol className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const reachable = index <= reached && !active;
          return (
            <li key={step.key} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${index + 1} of ${steps.length}: ${step.label}${done ? " (done)" : ""}`}
                className="group flex w-full min-w-0 flex-col gap-2 rounded-md pb-1 text-left disabled:cursor-default"
              >
                <span aria-hidden className="relative block h-1.5 w-full overflow-hidden rounded-full bg-tint-3">
                  <motion.span
                    className="absolute inset-0 origin-left bg-brand"
                    initial={false}
                    animate={{ scaleX: done || active ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
                  />
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "font-wide text-[0.6875rem] font-black tracking-[0.08em] tabular-nums",
                      active || done ? "text-brand" : "text-faint",
                    )}
                  >
                    {done ? <Check aria-hidden className="size-3.5" strokeWidth={3.5} /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "truncate text-xs font-bold uppercase tracking-widest",
                      active ? "text-ink" : done ? "text-muted group-hover:text-brand" : "text-faint",
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
