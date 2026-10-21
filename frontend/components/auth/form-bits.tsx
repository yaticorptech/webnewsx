"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** "── or ──" separator between Google and the email form. */
export function OrDivider({ label = "or", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.18em] text-faint uppercase", className)}>
      <span aria-hidden className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Form-level error banner (wrong password, rate limit, network). Always mounted as a live region
 * so screen readers announce the message when it appears.
 */
export function FormAlert({ message, action, className }: { message: string | null; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" aria-live="assertive" className={className}>
      <AnimatePresence initial={false}>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-tint-border bg-tint py-3 pr-3 pl-4 text-sm leading-snug font-medium text-ink">
              <span aria-hidden className="absolute inset-y-0 left-0 w-0.75 bg-brand" />
              <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                {message}
                {action && <span className="ml-1">{action}</span>}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Form-level good news (e.g. "Password updated") in the same shape as FormAlert, green; a polite live region. */
export function FormNotice({ message, className }: { message: string | null; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {message && (
        <div className="relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-success/25 bg-success-soft py-3 pr-3 pl-4 text-sm leading-snug font-medium text-ink">
          <span aria-hidden className="absolute inset-y-0 left-0 w-0.75 bg-success" />
          <CircleCheck aria-hidden className="mt-px size-4 shrink-0 text-success-strong" />
          <span className="min-w-0 flex-1">{message}</span>
        </div>
      )}
    </div>
  );
}
