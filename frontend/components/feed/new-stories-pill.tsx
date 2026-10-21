"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PulseDot } from "@/components/ui/pulse-dot";

export type NewStoriesPillProps = {
  count: number;
  onClick: () => void;
};

/**
 * Floating "● 2 new stories ↑" pill, sticky under the nav inside the feed column. Announced
 * politely to screen readers; clicking scrolls back to the top where the new stories are.
 */
export function NewStoriesPill({ count, onClick }: NewStoriesPillProps) {
  const label = `${count} new ${count === 1 ? "story" : "stories"}`;
  return (
    <>
      <div
        className={
          // Sits under the sticky nav; rises to the top edge while the phone nav is hidden on scroll-down.
          "pointer-events-none sticky top-[calc(var(--nav-h)+0.75rem)] z-30 flex h-0 justify-center transition-[top] duration-300 ease-snap [body:has(header[data-hidden])_&]:top-3"
        }
      >
        <AnimatePresence>
          {count > 0 && (
            <motion.button
              type="button"
              onClick={onClick}
              initial={{ opacity: 0, y: -14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 480, damping: 32 }}
              className="pointer-events-auto inline-flex h-10 items-center gap-2.5 rounded-full bg-brand px-5 text-[0.8125rem] font-extrabold tracking-wide text-brand-contrast shadow-pop font-wide transition-colors hover:bg-brand-hover"
            >
              <PulseDot size="xs" tone="white" />
              <span>{label}</span>
              <ArrowUp aria-hidden className="size-4" strokeWidth={2.75} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {count > 0 ? `${label} at the top of the feed` : ""}
      </p>
    </>
  );
}
