"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Animated speed-line effects (client). Both play once on mount — remount (change `key`)
 * to replay. Reduced motion: burst renders nothing, sweep shows a brief static fade.
 */

export type SpeedLinesBurstProps = {
  /** Diameter in px. */
  size?: number;
  className?: string;
  onComplete?: () => void;
};

/** Short bars radiating from the centre — the like "pop" accent. Position it over the icon. */
export function SpeedLinesBurst({ size = 44, className, onComplete }: SpeedLinesBurstProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", className)}
      style={{ width: size, height: size }}
    >
      {angles.map((angle, i) => (
        <span
          key={angle}
          className="absolute left-1/2 top-1/2 h-0.5 w-[28%] origin-left"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <motion.span
            className="block h-full w-full rounded-full bg-brand"
            initial={{ x: "20%", scaleX: 0.2, opacity: 1 }}
            animate={{ x: "120%", scaleX: 1, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1], delay: i % 2 ? 0.03 : 0 }}
            onAnimationComplete={i === 0 ? onComplete : undefined}
          />
        </span>
      ))}
    </span>
  );
}

export type SpeedLinesSweepProps = {
  className?: string;
  /** Total duration in seconds. */
  duration?: number;
  onComplete?: () => void;
};

/**
 * Full-bleed red speed lines sweeping left → right (publish success). Absolutely positioned:
 * place inside a `relative overflow-hidden` container.
 */
export function SpeedLinesSweep({ className, duration = 0.9, onComplete }: SpeedLinesSweepProps) {
  const reduce = useReducedMotion();
  // The icon's three bars (height 11, gap 6, forward lean ≈ 47°) scaled to the container.
  const rows = [
    { top: "22%", height: "13.7%", delay: 0 },
    { top: "43.2%", height: "13.7%", delay: 0.07 },
    { top: "64.4%", height: "13.7%", delay: 0.14 },
  ];

  if (reduce) {
    return (
      <motion.div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 bg-brand-soft", className)}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        onAnimationComplete={onComplete}
      />
    );
  }

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {rows.map((row, i) => (
        <motion.span
          key={row.top}
          className="absolute -left-1/4 block w-[150%] bg-brand"
          style={{ top: row.top, height: row.height, skewX: -47 }}
          initial={{ x: "-110%" }}
          animate={{ x: "110%" }}
          transition={{ duration, ease: [0.76, 0, 0.24, 1], delay: row.delay }}
          onAnimationComplete={i === rows.length - 1 ? onComplete : undefined}
        />
      ))}
    </div>
  );
}
