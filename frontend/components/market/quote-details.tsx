"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useState, type PointerEvent } from "react";
import { PulseDot } from "@/components/ui/pulse-dot";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { MarketQuote, MarketRange } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * A quote's details (owner 2026-10-22: "every card clickable — hover on a computer, tap on a phone — showing more"):
 * the price and move, a chart of today / the week / the month with a crosshair, and the numbers — open, high, low,
 * previous close, the 52-week range, when it was last updated. Shown in a panel beside the card (computers) or a
 * bottom sheet (phones) by market-view.tsx. The week and month come from GET /api/market/history as they're asked for.
 */

const RANGES: { value: MarketRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "1W" },
  { value: "1mo", label: "1M" },
];

export function QuoteDetails({ quote, className }: { quote: MarketQuote; className?: string }) {
  const [range, setRange] = useState<MarketRange>("1d");
  const history = useQuery({
    queryKey: qk.marketHistory(quote.id, range),
    queryFn: ({ signal }) => api.marketHistory(quote.id, range, signal),
    enabled: range !== "1d",
    staleTime: 5 * 60_000,
  });
  const points = range === "1d" ? quote.trend.map((v, i) => ({ t: quote.times[i] ?? 0, v })) : (history.data?.points ?? []);
  const previousClose = range === "1d" ? quote.previousClose : (history.data?.previousClose ?? null);
  const up = points.length >= 2 ? points[points.length - 1]!.v >= points[0]!.v : quote.change >= 0;
  const open = quote.trend[0] ?? null;
  const format = (value: number) => money(value, quote.currency);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
            {quote.unit}
            <LiveBadge open={quote.open} />
          </p>
          <p className="mt-1 font-wide text-[1.75rem] font-black leading-none tracking-tight text-ink tabular-nums">{format(quote.price)}</p>
          <p className="mt-1.5">
            <Change quote={quote} />
          </p>
        </div>
        <div role="group" aria-label="Range" className="flex shrink-0 rounded-full bg-surface-2 p-1">
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.6875rem] font-bold transition-colors",
                range === option.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {range !== "1d" && history.isPending ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <DetailChart points={points} previousClose={previousClose} up={up} range={range} format={format} />
      )}

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-3 text-sm sm:grid-cols-3">
        <Stat label="Open" value={open === null ? "—" : number(open, quote.currency)} />
        <Stat label="Day high" value={quote.dayHigh === null ? "—" : number(quote.dayHigh, quote.currency)} />
        <Stat label="Day low" value={quote.dayLow === null ? "—" : number(quote.dayLow, quote.currency)} />
        <Stat label="Prev. close" value={number(quote.previousClose, quote.currency)} />
        <Stat label="52-wk high" value={quote.fiftyTwoWeekHigh === null ? "—" : number(quote.fiftyTwoWeekHigh, quote.currency)} />
        <Stat label="52-wk low" value={quote.fiftyTwoWeekLow === null ? "—" : number(quote.fiftyTwoWeekLow, quote.currency)} />
      </dl>
      <p className="text-xs text-muted">Updated {clock(quote.updatedAt)} IST · delayed a few minutes · information only, not investment advice.</p>
    </div>
  );
}

/* ─────────────── The chart ─────────────── */

const W = 560;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

function DetailChart({
  points,
  previousClose,
  up,
  range,
  format,
}: {
  points: { t: number; v: number }[];
  previousClose: number | null;
  up: boolean;
  range: MarketRange;
  format: (value: number) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <div className="flex h-40 items-center justify-center rounded-xl bg-surface-2 text-sm text-muted">No chart yet — nothing has traded in this range.</div>;
  }
  const values = points.map((p) => p.v);
  const guide = previousClose !== null && range === "1d" ? [previousClose] : [];
  const lo = Math.min(...values, ...guide);
  const hi = Math.max(...values, ...guide);
  const span = hi - lo || hi * 0.01 || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * innerH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;
  const color = up ? "var(--success)" : "var(--brand)";
  const last = points[points.length - 1]!;
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * (points.length - 1)));
  const at = hover === null ? null : points[hover]!;
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Chart: from ${format(points[0]!.v)} to ${format(last.v)}`}
        className="block h-auto w-full touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {guide.length > 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(previousClose!)} y2={y(previousClose!)} stroke="var(--border-strong)" strokeDasharray="4 5" />}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {ticks.map((i, n) => (
          <text key={i} x={x(i)} y={H - 7} textAnchor={n === 0 ? "start" : n === ticks.length - 1 ? "end" : "middle"} fill="var(--muted)" fontSize="11" fontWeight="600">
            {timeLabel(points[i]!.t, range)}
          </text>
        ))}
        {at && hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border-strong)" />
            <circle cx={x(hover)} cy={y(at.v)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </>
        ) : (
          <circle cx={x(points.length - 1)} cy={y(last.v)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
        )}
      </svg>
      {at && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-surface shadow-pop"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {format(at.v)} <span className="opacity-70">· {timeLabel(at.t, range, true)}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Bits ─────────────── */

/** "▲ +123.45 (0.54%)" in green, red or grey. */
export function Change({ quote, compact = false }: { quote: MarketQuote; compact?: boolean }) {
  const up = quote.change > 0;
  const down = quote.change < 0;
  const Arrow = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "text-success" : down ? "text-brand" : "text-muted";
  const sign = up ? "+" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", compact ? "text-xs" : "text-sm", tone)}>
      <Arrow aria-hidden className={compact ? "size-3.5" : "size-4"} strokeWidth={2.5} />
      {sign}
      {number(quote.change, quote.currency)} ({sign}
      {quote.changePercent.toFixed(2)}%)
      <span className="sr-only"> {up ? "up" : down ? "down" : "unchanged"} today</span>
    </span>
  );
}

export function LiveBadge({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
        open ? "bg-success-soft text-success-strong" : "bg-surface-2 text-muted",
      )}
    >
      {open && <PulseDot size="xs" tone="success" />}
      {open ? "Live" : "Closed"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "₹ 22,662.55" · "$ 112.19" (Indian digit grouping for rupees). */
export function money(value: number, currency: MarketQuote["currency"]): string {
  return `${currency === "INR" ? "₹" : "$"} ${number(value, currency)}`;
}

export function number(value: number, currency: MarketQuote["currency"]): string {
  return (currency === "INR" ? inr : usd).format(value);
}

const IST = "Asia/Kolkata";
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...options, timeZone: IST });
const HOUR = fmt({ hour: "numeric", hour12: true });
const CLOCK = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const DAY = fmt({ weekday: "short" });
const DAY_CLOCK = fmt({ weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
const DATE = fmt({ day: "numeric", month: "short" });

/** "9 am" / "Mon" / "12 Oct" along the foot; the fuller form for the crosshair. */
function timeLabel(epochSeconds: number, range: MarketRange, full = false): string {
  const date = new Date(epochSeconds * 1000);
  if (range === "1d") return (full ? CLOCK : HOUR).format(date);
  if (range === "5d") return (full ? DAY_CLOCK : DAY).format(date);
  return DATE.format(date);
}

/** "3:18 pm" in India's time. */
export function clock(iso: string): string {
  return CLOCK.format(new Date(iso));
}
