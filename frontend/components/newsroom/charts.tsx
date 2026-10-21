"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/*
 * Hand-built SVG charts for the Newsroom (SPEC §3.11: "lightweight hand-built SVG, brand red series,
 * accessible data tables"). One series per chart, one y-axis, brand red marks, recessive hairline grid,
 * a crosshair (line) or per-bar tooltip that also works with the keyboard (←/→, Home/End), an aria-live
 * readout, and a table twin rendered by the caller (`<ChartTable>`).
 */

const BRAND = "var(--brand)";

/** Width of the element, measured after mount (0 before — callers reserve the height). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 0-based "nice" ticks covering `max` (1 · 2 · 2.5 · 5 × 10ⁿ steps), 3–5 of them. */
export function niceTicks(max: number, target = 4): number[] {
  const top = Math.max(max, 1);
  const raw = top / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const niceStep = step < 1 ? 1 : step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + niceStep * 0.001 || ticks.length < 2; v += niceStep) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1]! < top) ticks.push(ticks[ticks.length - 1]! + niceStep);
  return ticks;
}

function compactTick(value: number): string {
  if (value >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10}M`;
  if (value >= 1000) return `${Math.round((value / 1000) * 10) / 10}K`;
  return String(Math.round(value * 10) / 10);
}

/** Evenly spread label indices (always the first and the last). */
function labelIndices(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>([0, count - 1]);
  const step = (count - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

export type TooltipRow = { label: string; value: string; strong?: boolean };

/** Keyboard + pointer "active index" shared by both chart kinds. */
function useActiveIndex(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count === 0) return;
      const current = active ?? count - 1;
      let next: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(count - 1, current + 1);
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, current - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = count - 1;
      else if (event.key === "Escape") {
        setActive(null);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      setActive(next);
    },
    [active, count],
  );
  return { active, setActive, onKeyDown };
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: TooltipRow[] }) {
  // Keep the bubble inside the plot: flip to the left half past the middle.
  const right = x > width / 2;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-xl border border-border bg-surface px-3 py-2 shadow-pop"
      style={right ? { right: Math.max(0, width - x + 10) } : { left: Math.min(width - 150, x + 10) }}
    >
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((row, i) => (
          <li key={row.label} className="flex items-center gap-2 text-[0.8125rem] leading-snug">
            {i === 0 && <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full bg-brand" />}
            <span className={cn("tabular-nums", row.strong || i === 0 ? "font-extrabold text-ink" : "font-bold text-ink-2", i > 0 && "pl-5")}>
              {row.value}
            </span>
            <span className="text-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type LineChartProps = {
  /** x labels (already formatted, e.g. "Sep 24") and values. */
  points: { label: string; value: number }[];
  /** Tooltip title per point (e.g. "Thu, Sep 24"). Defaults to the label. */
  titleFor?: (index: number) => string;
  /** Tooltip rows per point; the first row is the plotted series. */
  rowsFor: (index: number) => TooltipRow[];
  /** Accessible summary of the whole chart. */
  ariaLabel: string;
  /** Screen-reader readout of the focused point. */
  announce: (index: number) => string;
  height?: number;
  /** Animate the line in again when this changes (range / metric switch). */
  animationKey?: string;
  /** Refetching: keep the frame, dim it. */
  dimmed?: boolean;
  /** Format the last-point direct label. */
  formatValue?: (value: number) => string;
  /** Shown over the plot when every value is 0. */
  emptyMessage?: string;
  className?: string;
};

/** Single-series line + soft area wash with an end marker, crosshair tooltip and keyboard access. */
export function LineChart({
  points,
  titleFor,
  rowsFor,
  ariaLabel,
  announce,
  height = 220,
  animationKey,
  dimmed = false,
  formatValue = compactTick,
  emptyMessage,
  className,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const reduce = useReducedMotion();
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { active, setActive, onKeyDown } = useActiveIndex(points.length);

  const margin = { top: 16, right: 14, bottom: 28, left: 40 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const n = points.length;
  const x = (i: number) => margin.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => margin.top + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = n > 0 ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const labels = labelIndices(n, width < 420 ? 4 : 7);
  const last = n - 1;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div
      ref={ref}
      className={cn("relative select-none transition-opacity duration-300", dimmed && "opacity-50", className)}
      style={{ height }}
    >
      {width > 0 && n > 0 && (
        <>
          <svg aria-hidden width={width} height={height} className="block overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.16} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
                <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[0.6875rem] tabular-nums">
                  {compactTick(tick)}
                </text>
              </g>
            ))}
            {labels.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 8}
                textAnchor={i === 0 && n > 1 ? "start" : i === last && n > 1 ? "end" : "middle"}
                className="fill-muted text-[0.6875rem]"
              >
                {points[i]!.label}
              </text>
            ))}
            <motion.path
              key={`area-${animationKey}`}
              d={area}
              fill={`url(#${gradientId})`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            />
            <motion.path
              key={`line-${animationKey}`}
              d={line}
              fill="none"
              stroke={BRAND}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
            />
            {/* End marker + direct label (the one number the line leads to). */}
            <circle cx={x(last)} cy={y(points[last]!.value)} r={4} fill={BRAND} stroke="var(--surface)" strokeWidth={2} />
            <text
              x={x(last) - 8}
              y={y(points[last]!.value) - 10}
              textAnchor="end"
              className="fill-ink text-[0.75rem] font-bold tabular-nums"
            >
              {formatValue(points[last]!.value)}
            </text>
            {active !== null && (
              <g aria-hidden>
                <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + innerH} stroke="var(--ink)" strokeOpacity={0.25} strokeWidth={1} />
                <circle cx={x(active)} cy={y(points[active]!.value)} r={5} fill={BRAND} stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
            <rect
              x={margin.left}
              y={0}
              width={innerW}
              height={height - margin.bottom + 6}
              fill="transparent"
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
            />
          </svg>
          {active !== null && (
            <Tooltip x={x(active)} width={width} title={titleFor?.(active) ?? points[active]!.label} rows={rowsFor(active)} />
          )}
          {emptyMessage && max === 0 && active === null && (
            <p
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted shadow-card"
              style={{ top: margin.top + innerH / 2 - 16 }}
            >
              {emptyMessage}
            </p>
          )}
        </>
      )}
      {/* Keyboard access to every point; the readout is announced politely. */}
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Use the arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? last)}
        onBlur={() => setActive(null)}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        style={{ pointerEvents: "none" }}
      />
      <p aria-live="polite" className="sr-only">
        {active !== null ? announce(active) : ""}
      </p>
    </div>
  );
}

export type BarChartProps = {
  values: number[];
  /** Axis label per bar (may be empty to skip). */
  tickLabel: (index: number) => string;
  titleFor: (index: number) => string;
  rowsFor: (index: number) => TooltipRow[];
  /** Bars drawn in the brand red; the rest in the pale de-emphasis pink. */
  highlight: ReadonlySet<number>;
  ariaLabel: string;
  announce: (index: number) => string;
  height?: number;
  className?: string;
};

/** Thin columns (≤24px, 4px rounded top, 2px gaps) with emphasis-by-colour and per-bar tooltips. */
export function BarChart({ values, tickLabel, titleFor, rowsFor, highlight, ariaLabel, announce, height = 170, className }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const reduce = useReducedMotion();
  const { active, setActive, onKeyDown } = useActiveIndex(values.length);

  const margin = { top: 12, right: 4, bottom: 24, left: 4 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const n = values.length;
  const max = Math.max(1, ...values);
  const slot = n > 0 ? innerW / n : 0;
  const bar = Math.max(2, Math.min(24, slot - 2));
  const baseY = margin.top + innerH;
  const cx = (i: number) => margin.left + slot * i + slot / 2;

  const column = (i: number, value: number) => {
    const h = Math.max(value > 0 ? 3 : 0, (value / max) * innerH);
    const left = cx(i) - bar / 2;
    const r = Math.min(4, bar / 2, h);
    const topY = baseY - h;
    return `M${left},${baseY} L${left},${topY + r} Q${left},${topY} ${left + r},${topY} L${left + bar - r},${topY} Q${left + bar},${topY} ${left + bar},${topY + r} L${left + bar},${baseY} Z`;
  };

  return (
    <div ref={ref} className={cn("relative select-none", className)} style={{ height }}>
      {width > 0 && (
        <>
          <svg aria-hidden width={width} height={height} className="block overflow-visible">
            <line x1={margin.left} x2={width - margin.right} y1={baseY} y2={baseY} stroke="var(--border-strong)" strokeWidth={1} />
            {values.map((value, i) => (
              <motion.path
                key={i}
                d={column(i, value)}
                fill={highlight.has(i) ? "var(--brand)" : "var(--tint-border)"}
                opacity={active === null || active === i ? 1 : 0.55}
                style={{ originX: 0.5, originY: 1 }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
              />
            ))}
            {values.map((_, i) => {
              const label = tickLabel(i);
              return label ? (
                <text key={`t${i}`} x={cx(i)} y={height - 7} textAnchor="middle" className="fill-muted text-[0.6875rem]">
                  {label}
                </text>
              ) : null;
            })}
            {values.map((_, i) => (
              <rect
                key={`h${i}`}
                x={margin.left + slot * i}
                y={0}
                width={slot}
                height={baseY}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
              />
            ))}
          </svg>
          {active !== null && <Tooltip x={cx(active)} width={width} title={titleFor(active)} rows={rowsFor(active)} />}
        </>
      )}
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Use the arrow keys to read each bar.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? 0)}
        onBlur={() => setActive(null)}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        style={{ pointerEvents: "none" }}
      />
      <p aria-live="polite" className="sr-only">
        {active !== null ? announce(active) : ""}
      </p>
    </div>
  );
}

/** Tiny trend line for a KPI tile: grey history, the latest point in brand red. Decorative (the tile has the numbers). */
export function Sparkline({ values, width = 72, className }: { values: number[]; width?: number; className?: string }) {
  const w = width;
  const h = 26;
  if (values.length < 2) return <span aria-hidden className={cn("block", className)} style={{ width: w, height: h }} />;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const d = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg aria-hidden width={w} height={h} viewBox={`-3 0 ${w + 6} ${h}`} className={cn("block overflow-visible", className)}>
      <path d={d} fill="none" stroke="var(--muted-2)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--brand)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

/** The chart's table twin in a disclosure ("Show data table"). */
export function ChartTable({
  caption,
  columns,
  rows,
  className,
}: {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
  className?: string;
}) {
  return (
    <details className={cn("group/table mt-3", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 text-xs font-bold text-brand hover:text-brand-hover [&::-webkit-details-marker]:hidden">
        <span className="transition-transform duration-200 group-open/table:rotate-90" aria-hidden>
          ▸
        </span>
        <span className="group-open/table:hidden">Show data table</span>
        <span className="hidden group-open/table:inline">Hide data table</span>
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {columns.map((col, i) => (
                <th key={col} scope="col" className={cn("px-3 py-2 text-xs font-bold text-ink", i > 0 && "text-right")}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-border">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="whitespace-nowrap px-3 py-1.5 font-semibold text-ink-2">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="px-3 py-1.5 text-right tabular-nums text-ink">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
