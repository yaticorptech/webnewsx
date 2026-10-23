"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { SpeedLinesSweep } from "@/components/brand/speed-lines-motion";
import { PulseDot } from "@/components/ui/pulse-dot";

export type PublishSuccessProps = {
  title: string;
  /** `live` = published ("You're live"); `review` = a Trainee's story sent to the Review Desk ("Filed"). */
  variant?: "live" | "review";
  /** Who reviews it (default the Review Desk; a group writer's story: "the group's editors", owner 2026-10-23). */
  reviewer?: string;
  /** Called once the moment has played (navigate away here). */
  onDone: () => void;
};

const noopSubscribe = () => () => {};

/**
 * Full-screen "You're live" (or, for a Trainee's submission, "In review") moment: a white page with a soft pink glow, the icon's crimson speed lines
 * sweep across, then a rubber stamp slams in over the headline. Reduced motion: a short static card.
 */
export function PublishSuccess({ title, onDone, variant = "live", reviewer = "the Review Desk" }: PublishSuccessProps) {
  const review = variant === "review";
  const reduce = useReducedMotion();
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const timer = setTimeout(() => done.current(), reduce ? 1100 : 2300);
    return () => {
      clearTimeout(timer);
      document.documentElement.style.overflow = previous;
    };
  }, [reduce]);

  if (!isClient) return null;

  return createPortal(
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="status"
      aria-live="assertive"
      aria-label={review ? `Your story was sent to ${reviewer}` : "Your story is live"}
      data-tour="publish-success"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-150 flex items-center justify-center overflow-hidden bg-bg px-6 text-ink outline-none"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_48%,var(--tint-2),transparent_72%)]"
      />
      <SpeedLinesSweep duration={0.85} />
      <SpeedBarsSvg className="pointer-events-none absolute -right-24 -bottom-16 w-md max-w-[80vw] text-brand opacity-[0.06]" />

      <div className="relative flex max-w-3xl flex-col items-center text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.55, duration: 0.3 }}
          className="kicker mb-10 flex items-center gap-2 text-muted"
        >
          <PulseDot size="sm" />
          {review ? `Sent to ${reviewer}` : "Published to WebNEWS"}
        </motion.p>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 2.4, rotate: -14 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -6 }}
          transition={
            reduce ? { duration: 0.2 } : { delay: 0.5, type: "spring", stiffness: 520, damping: 22, mass: 0.9 }
          }
          className="relative"
        >
          <span className="relative block rounded-md border-5 border-brand bg-bg/80 px-6 py-3 font-wider text-[clamp(2.5rem,10vw,4.75rem)] font-black uppercase leading-[0.95] tracking-[-0.02em] text-brand sm:whitespace-nowrap sm:px-9">
            {review ? "In review" : <>You&rsquo;re live</>}
            <span aria-hidden className="absolute inset-1 rounded-[3px] border border-brand/50" />
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0.1 : 0.85, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="mt-12 line-clamp-3 max-w-lg font-wide text-lg font-extrabold leading-snug text-ink sm:text-xl"
        >
          {title}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0.1 : 1 }}
          className="mt-8 flex w-48 flex-col items-center gap-2"
        >
          <span className="relative h-0.5 w-full overflow-hidden rounded-full bg-border">
            <motion.span
              className="absolute inset-0 origin-left bg-brand"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: reduce ? 0 : 1, duration: reduce ? 1 : 1.25, ease: "linear" }}
            />
          </span>
          <span className="text-xs text-muted">{review ? "Taking you to your desk…" : "Taking you to the front page…"}</span>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  );
}
