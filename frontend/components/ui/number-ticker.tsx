"use client";

import { animate, AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { compactNumber, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NumberTickerProps = {
  value: number;
  /** `compact` → "1.2K" (default) · `plain` → "1,234". */
  format?: "compact" | "plain";
  /** Count up from 0 the first time the number scrolls into view (profile stats). */
  countUp?: boolean;
  /** Count-up duration in seconds. */
  duration?: number;
  className?: string;
};

/** 1 = roll up (increase), -1 = roll down, 0 = swap instantly. */
type Direction = 1 | -1 | 0;

const variants = {
  enter: (dir: Direction) => ({ y: `${dir * 90}%`, opacity: dir === 0 ? 1 : 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (dir: Direction) =>
    dir === 0 ? { opacity: 0, transition: { duration: 0 } } : { y: `${dir * -90}%`, opacity: 0 },
};

/**
 * Animated count. Changes roll vertically (up when increasing, down when decreasing); with
 * `countUp` the first view counts from 0. Server output is the final value (no layout shift,
 * readable without JS) and the markup is identical on server and client. Screen readers get
 * the settled value only. Reduced motion (MotionConfig "user"): no roll, no count-up.
 */
export function NumberTicker({ value, format = "compact", countUp = false, duration = 0.9, className }: NumberTickerProps) {
  const fmt = format === "plain" ? formatNumber : compactNumber;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  // Roll direction, derived from the previous value during render.
  const [previous, setPrevious] = useState(value);
  const [direction, setDirection] = useState<Direction>(1);
  if (value !== previous) {
    setDirection(value > previous ? 1 : -1);
    setPrevious(value);
  }

  // Count-up: `counting` is the in-flight number; `countedFor` keeps the count element mounted
  // (stable key) until the value changes, so finishing the count doesn't trigger a roll.
  const [counting, setCounting] = useState<number | null>(null);
  const [countedFor, setCountedFor] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!countUp || reduce || !inView || startedRef.current || value <= 0) return;
    startedRef.current = true;
    const target = value;
    setDirection(0);
    setCountedFor(target);
    setCounting(0);
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setCounting(Math.round(latest)),
      onComplete: () => setCounting(null),
    });
    return () => {
      controls.stop();
      setCounting(null);
    };
    // Only the first view counts up; later value changes roll instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countUp, reduce, inView]);

  const text = fmt(value);
  const key = countedFor === value ? "count" : text;
  const shown = counting !== null && countedFor === value ? fmt(counting) : text;

  return (
    <span ref={ref} className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-grid overflow-hidden *:[grid-area:1/1]">
        <AnimatePresence initial={false} custom={direction}>
          <motion.span
            key={key}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.7 }}
            className="inline-block"
          >
            {shown}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
