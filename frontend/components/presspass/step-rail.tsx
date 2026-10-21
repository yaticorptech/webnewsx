"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type StepRailProps = {
  steps: readonly { key: string; label: string; short?: string }[];
  current: number;
  /** Furthest step reached — it and every earlier step are clickable. */
  reached: number;
  onSelect: (index: number) => void;
  label: string;
  className?: string;
};

/**
 * "01 Verification & region — 02 About you — 03 Pledge": rounded bars that fill crimson as you advance;
 * reached steps are buttons, the current one carries aria-current="step".
 */
export function StepRail({ steps, current, reached, onSelect, label, className }: StepRailProps) {
  return (
    <nav aria-label={label} className={className}>
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
                      "font-wide text-[0.6875rem] font-black tabular-nums tracking-[0.08em]",
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
                    {step.short ? (
                      <>
                        <span className="sm:hidden">{step.short}</span>
                        <span className="max-sm:hidden">{step.label}</span>
                      </>
                    ) : (
                      step.label
                    )}
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
