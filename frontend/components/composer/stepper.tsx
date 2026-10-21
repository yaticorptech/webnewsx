"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Owner 2026-10-02: the poster first (cover, headline, category, template), then the article, then the preview. */
export type ComposerStep = "poster" | "article" | "preview";

/** Owner 2026-10-14: 1 the images, 2 the story's details, 3 preview & publish. */
const STEPS: { value: ComposerStep; number: string; label: string; hint: string }[] = [
  { value: "poster", number: "01", label: "Images", hint: "Upload or take a photo" },
  { value: "article", number: "02", label: "Story", hint: "Category, headline, description" },
  { value: "preview", number: "03", label: "Publish", hint: "Preview, then publish" },
];

export type StepperProps = {
  step: ComposerStep;
  onStepChange: (step: ComposerStep) => void;
  disabled?: boolean;
  /** Steps whose fields are all filled correctly: only these show the tick (owner 2026-10-15). */
  complete?: Partial<Record<ComposerStep, boolean>>;
  /** What the last step says when it doesn't publish (a Trainee's Review Desk, a press meet's organizer). */
  previewHint?: string;
};

/**
 * "01 Poster → 02 Article → 03 Preview": numbered crimson discs, a rule that fills toward the active step and a
 * 2px crimson underline that slides between the steps. Steps are buttons (aria-current="step").
 */
export function Stepper({ step, onStepChange, disabled, previewHint, complete = {} }: StepperProps) {
  const activeIndex = STEPS.findIndex((s) => s.value === step);
  return (
    <nav aria-label="Publishing steps">
      <ol className="flex items-stretch gap-2 sm:gap-4">
        {STEPS.map((item, index) => {
          const active = item.value === step;
          const done = !active && complete[item.value] === true;
          return (
            <li
              key={item.value}
              className={cn("flex min-w-0 items-center gap-2 sm:gap-4", index === 0 ? "shrink-0" : "flex-1")}
            >
              {index > 0 && (
                <span aria-hidden className="relative h-0.5 min-w-3 flex-1 max-sm:-translate-y-2.5 sm:min-w-6 overflow-hidden rounded-full bg-border">
                  <motion.span
                    className="absolute inset-0 origin-left bg-brand"
                    initial={false}
                    animate={{ scaleX: activeIndex >= index ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => onStepChange(item.value)}
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                className="group relative flex shrink-0 flex-col items-center gap-1 rounded-full py-1 text-center outline-offset-4 disabled:opacity-60 sm:flex-row sm:gap-2.5 sm:py-2 sm:pr-1 sm:text-left"
              >
                <span
                  className={cn(
                    "relative inline-flex size-9 sm:size-10 items-center justify-center rounded-full font-wide text-sm font-extrabold tabular-nums transition-[background-color,color,box-shadow] duration-300",
                    active
                      ? "bg-brand text-brand-contrast shadow-[0_6px_16px_-6px_var(--brand-glow)]"
                      : done
                        ? "bg-tint text-brand ring-1 ring-tint-border"
                        : "bg-surface text-muted ring-1 ring-border-strong group-hover:text-ink group-hover:ring-ink/40",
                  )}
                >
                  {done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : item.number}
                  {done && <span className="sr-only">{item.number} (done)</span>}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "font-wide text-xs font-extrabold leading-tight transition-colors sm:text-[0.9375rem]",
                      active ? "text-ink" : "text-muted group-hover:text-ink",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="hidden text-xs text-muted sm:block">
                    {previewHint && item.value === "preview" ? previewHint : item.hint}
                  </span>
                </span>
                {active && (
                  <motion.span
                    layoutId="composer-step-indicator"
                    aria-hidden
                    className="absolute -bottom-2 left-0 right-0 h-0.5 sm:-bottom-3.5 sm:right-1 rounded-full bg-brand"
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
