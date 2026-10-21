"use client";

import { motion } from "motion/react";
import { PASSWORD_RULES, scorePassword } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type { PasswordScore, PasswordStrength } from "@/lib/shared/contracts";

/**
 * Four rounded segments that fill with the score (shared `scorePassword`, the same rule the API applies). An account
 * needs at least "Good" (owner rule 2026-09-25): below that the meter stays red and says what's missing.
 * `avoid` = personal words the password mustn't contain (the email's name part).
 */
export function PasswordStrengthMeter({
  value,
  avoid = [],
  id,
  className,
}: {
  value: string;
  avoid?: readonly string[];
  id?: string;
  className?: string;
}) {
  const { score, label, tip } = scorePassword(value, avoid);
  const strong = score >= PASSWORD_RULES.minScore;
  return (
    <div id={id} className={cn("flex flex-col gap-1.5", className)}>
      <div aria-hidden className="flex gap-1.5">
        {[1, 2, 3, 4].map((segment) => {
          const tooShort = score === 0 && value.length > 0;
          const filled = value.length > 0 && segment <= Math.max(score, 1);
          return (
            <span key={segment} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <motion.span
                className={cn("absolute inset-0 origin-left", strong ? "bg-success" : "bg-brand", tooShort && "bg-faint")}
                initial={false}
                animate={{ scaleX: filled ? 1 : 0 }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1], delay: filled ? (segment - 1) * 0.04 : 0 }}
              />
            </span>
          );
        })}
      </div>
      <p className="flex items-baseline justify-between gap-3 text-xs">
        {/* Only the label is live: it changes at thresholds, not on every keystroke. */}
        <span
          aria-live="polite"
          className={cn("shrink-0 font-bold", !label ? "text-muted" : strong ? "text-success" : score === 0 ? "text-muted" : "text-brand")}
        >
          {label ? <>Strength: {label}</> : <span className="font-medium">Password strength</span>}
        </span>
        <span className="text-right text-muted">{tip}</span>
      </p>
    </div>
  );
}
