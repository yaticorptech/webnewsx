"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The owner's icon bars (64×64 icon.svg), used as the Verified Reporter mark. */
const BARS = ["20,9 60,9 48,20 8,20", "20,26 60,26 48,37 8,37", "20,43 60,43 48,54 8,54"] as const;
/** Top edge y of each bar — the reveal masks are drawn per bar. */
const BAR_TOP = [9, 26, 43] as const;
/** The check mark (100×100 badge coordinates). */
const CHECK = "M29 52 L44 66 L72 36";

export type VerifiedBadgeProps = {
  /** Rendered size in px (square). 16–20 next to names, 28–40 in profile headers. */
  size?: number;
  /** Animate (default). `false` renders the finished badge. */
  animate?: boolean;
  /** Pause (ms) with the finished badge before the sequence plays again. `0` plays once. Default 4000. */
  loopEvery?: number;
  className?: string;
  /** Accessible name. */
  label?: string;
  /** Hover / keyboard-focus tooltip ("Verified" card). Default true. */
  tooltip?: boolean;
  /**
   * Keyboard focus stop for the tooltip (default true). Pass false inside a link or button row (rails,
   * lists) so the row stays a single tab stop — the tooltip still opens on mouse hover.
   */
  focusable?: boolean;
  /** Idle highlight once filled: the blue glow breathes. Default true. */
  highlight?: boolean;
};

/**
 * Verified Reporter badge (owner design 2026-09-24, revised 2026-09-26): the WebNEWS icon's three slanted bars
 * start grey and each fills with the logo red from right to left along the tilt (top → bottom, staggered); then a
 * blue check mark draws itself over them, a blue ring draws itself around the badge, the blue floods out to fill
 * that circle (the check turns white) and the badge pops with a soft blue glow. Final look: solid blue disc + white check; the glow breathes while it holds.
 * The sequence loops: it holds the finished badge for `loopEvery` ms, then plays again — only while the badge is
 * on screen and the tab is visible. Hover replays it at once. Always animates (owner request), even with Reduce
 * Motion on.
 */
export function VerifiedBadge({
  size = 18,
  animate = true,
  loopEvery = 4000,
  className,
  label = "Verified",
  tooltip = true,
  focusable = true,
  highlight = true,
}: VerifiedBadgeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [run, setRun] = useState(0); // 0 = not started yet; each increment (re)plays the sequence
  const [done, setDone] = useState(!animate);
  // Off screen, the breathing glow is paused (no repaint work for badges nobody can see).
  const [onScreen, setOnScreen] = useState(true);

  const play = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDone(false);
    setRun((n) => n + 1);
  }, []);

  // Start when first visible; keep tracking visibility so the loop only runs on screen.
  useEffect(() => {
    if (!animate) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      visible.current = true;
      play();
      return;
    }
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        // Thresholds 0 and 0.6: "on screen" at all (pauses/resumes the idle highlight) vs "clearly visible"
        // (starts and replays the sequence).
        visible.current = entry.intersectionRatio >= 0.6;
        setOnScreen(entry.isIntersecting);
        if (visible.current && !started) {
          started = true;
          play();
        }
      },
      { threshold: [0, 0.6] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [animate, play]);

  // Loop: after each finished sequence, wait `loopEvery` ms, then replay if on screen and the tab is visible.
  useEffect(() => {
    if (!animate || !done || run === 0 || loopEvery <= 0) return;
    const schedule = () => {
      timer.current = setTimeout(() => {
        if (visible.current && document.visibilityState === "visible") play();
        else schedule();
      }, loopEvery);
    };
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [animate, done, run, loopEvery, play]);

  const playing = animate && run > 0 && !done;

  const badge = (
    <span
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      tabIndex={tooltip && focusable ? 0 : undefined}
      onMouseEnter={animate ? play : undefined}
      className={cn(
        "verified-badge inline-flex shrink-0 rounded-full align-middle outline-offset-2",
        highlight && done && "vb-breathe",
        !onScreen && "vb-offscreen",
        className,
      )}
      style={{ width: size, height: size, "--vb-size": `${size}px` } as CSSProperties}
    >
      <svg
        key={run}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden
        className={cn(playing ? "vb-play" : animate && run === 0 ? "vb-idle" : "vb-done")}
        onAnimationEnd={(event) => {
          // The badge-level "pop" is the last step of the sequence.
          if (event.target === event.currentTarget) setDone(true);
        }}
      >
        <defs>
          {BAR_TOP.map((top, i) => (
            <mask key={top} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
              {/* Slanted reveal sheet (in bar coordinates): its left edge follows the bars' tilt; it slides in from the right. */}
              <polygon
                className={`vb-sheet vb-sheet-${i}`}
                points={`12,${top} 100,${top} 100,${top + 11} 0,${top + 11}`}
                fill="#fff"
              />
            </mask>
          ))}
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#1d9bf0" floodOpacity="0.55" />
          </filter>
        </defs>
        <g transform="translate(22.8 24.8) scale(0.8)">
          {BARS.map((points) => (
            <polygon key={points} points={points} className="vb-bar-grey" />
          ))}
          {BARS.map((points, i) => (
            <g key={points} mask={`url(#${uid}-m${i})`}>
              <polygon points={points} className="vb-bar-red" />
            </g>
          ))}
        </g>
        {/* The circle draws itself, then the blue disc floods out to fill it (final: blue disc + white check + glow). */}
        <circle cx="50" cy="50" r="46" pathLength={100} className="vb-ring" />
        <circle cx="50" cy="50" r="49" className="vb-disc" filter={`url(#${uid}-glow)`} />
        {/* The check: a white halo keeps it readable over the red bars until the disc covers them. */}
        <path d={CHECK} pathLength={100} className="vb-check-halo" />
        <path d={CHECK} pathLength={100} className="vb-check" />
      </svg>
    </span>
  );

  if (!tooltip) return badge;
  return (
    <Tooltip
      side="top"
      delay={120}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1.5 pr-3 text-[0.75rem] font-normal"
      content={
        <>
          <VerifiedBadge size={14} animate={false} tooltip={false} highlight={false} label="" />
          <span className="font-extrabold text-ink">Verified</span>
          {label !== "Verified" && <span className="text-muted">{label.replace(/^Verified\s*/i, "")}</span>}
        </>
      }
    >
      {badge}
    </Tooltip>
  );
}
