"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PulseDot } from "@/components/ui/pulse-dot";
import { api, errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { qk } from "@/lib/query-keys";
import type { MarketQuote, MarketResponse } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { Change, LiveBadge, QuoteDetails, clock, money, number } from "./quote-details";

/*
 * /market (owner 2026-10-22: "next to Home, a Market category with live Nifty, Sensex, NSE, gold rate… all live
 * prices"): the day's numbers as tiles — the NSE / BSE indices, gold and silver in rupees, crude, the rupee and
 * Bitcoin — each with its price, the day's change in green or red, today's path as a small line, and whether the
 * exchange is open. Every tile opens its details (quote-details.tsx) — hovering or clicking on a computer, tapping on
 * a phone (owner 2026-10-22). Served by GET /api/market (one source round a minute, shared by everyone) and refreshed
 * here every minute while the page is on screen; the first paint comes from the server.
 */

const REFRESH_MS = 60_000;
/** The details panel beside a tile (computers): its width and the height it needs below or above the tile. */
const PANEL_W = 416;
const PANEL_H = 440;
const HOVER_OPEN_MS = 140;

const GROUPS: { key: MarketQuote["group"]; title: string; lede: string }[] = [
  { key: "indices", title: "Indices", lede: "NSE and BSE, live during market hours (9:15 am – 3:30 pm IST, Monday to Friday)." },
  { key: "commodities", title: "Commodities", lede: "World prices: gold and silver converted to rupees at the live dollar rate, Brent crude in dollars." },
  { key: "currency", title: "Rupee", lede: "What a dollar and a euro cost in rupees right now." },
  { key: "crypto", title: "Crypto", lede: "Bitcoin in rupees, around the clock." },
];

const noopSubscribe = () => () => {};

export function MarketView({ initial }: { initial: MarketResponse | null }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const phone = useMediaQuery("(max-width: 767.98px)");
  const { data, isError, error, isFetching, refetch } = useQuery({
    queryKey: qk.market,
    queryFn: ({ signal }) => api.market(signal),
    initialData: initial ?? undefined,
    staleTime: 30_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  const quotes = data?.quotes ?? [];
  const anyOpen = quotes.some((quote) => quote.group === "indices" && quote.open);
  // One open tile at a time (its id), on computers the hovered or clicked one, on phones the tapped one (a sheet).
  const [openId, setOpenId] = useState<string | null>(null);
  const openQuote = quotes.find((quote) => quote.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header className="panel-tint flex flex-col gap-2 px-5 py-6 sm:px-8 sm:py-8">
        <p className="kicker flex items-center gap-2 text-brand">
          {anyOpen ? (
            <>
              <PulseDot size="sm" tone="brand" /> Live · market open
            </>
          ) : (
            "Markets · last close"
          )}
        </p>
        <h1 id="market-heading" className="font-wide text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
          Market
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-[0.9375rem]">
          Nifty, Sensex, gold, silver, crude, the rupee and Bitcoin — the live numbers, refreshed every minute.
          {phone ? " Tap a card for its chart and details." : " Hover over a card for its chart and details."}
          {data && isClient && (
            <>
              {" "}
              <span className="whitespace-nowrap">Updated {clock(data.fetchedAt)} IST</span>
              {isFetching && <span className="sr-only"> (refreshing)</span>}
            </>
          )}
        </p>
      </header>

      {isError && quotes.length === 0 ? (
        <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="font-wide text-base font-extrabold text-ink">Market prices aren&apos;t available right now</p>
          <p className="text-sm text-muted">{errorMessage(error)}</p>
          <Button variant="outline" leftIcon={<RotateCcw aria-hidden />} onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        GROUPS.map((group) => {
          const items = quotes.filter((quote) => quote.group === group.key);
          if (items.length === 0) return null;
          return (
            <section key={group.key} aria-labelledby={`market-${group.key}`} className="flex flex-col gap-3">
              <div>
                <h2 id={`market-${group.key}`} className="font-wide text-lg font-extrabold text-ink">
                  {group.title}
                </h2>
                <p className="text-sm text-muted">{group.lede}</p>
              </div>
              <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((quote) => (
                  <li key={quote.id} className="min-w-0">
                    <QuoteTile quote={quote} open={openId === quote.id} phone={phone} onOpen={() => setOpenId(quote.id)} onClose={() => setOpenId((id) => (id === quote.id ? null : id))} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <p className="text-xs leading-relaxed text-muted">
        Indices and prices are delayed by a few minutes and are for information only, not investment advice. Gold and silver
        are the international price converted to rupees; a jeweller&apos;s board adds duty, GST and making charges.
      </p>

      {/* Phones: the tapped quote's details as a bottom sheet. */}
      <Modal
        open={phone && openQuote !== null}
        onOpenChange={(value) => {
          if (!value) setOpenId(null);
        }}
        title={openQuote?.name ?? ""}
        hideHeader
        variant="sheet"
        size="md"
      >
        {openQuote && (
          <div className="px-5 pb-6 pt-2">
            <h2 className="mb-3 font-wide text-xl font-extrabold text-ink">{openQuote.name}</h2>
            <QuoteDetails quote={openQuote} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * One number: name and unit, the price, the day's move in green or red, today's line, open / closed. A button: on a
 * computer, resting the pointer on it (or clicking) opens the details panel beside it; on a phone, tapping it opens the
 * sheet (MarketView). The panel is drawn over the page (a portal, fixed), above the sticky bars (owner 2026-10-22: it
 * slid under the navbar): below the tile when that fits, else above it but under the navbar's edge, else pinned inside
 * the window. Moving the pointer into the panel keeps it open; leaving both, Escape, or scrolling closes it.
 */
function QuoteTile({ quote, open, phone, onOpen, onClose }: { quote: MarketQuote; open: boolean; phone: boolean; onOpen: () => void; onClose: () => void }) {
  const down = quote.change < 0;
  // The panel is a portal on document.body: only once in the browser (server rendering has no document).
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  // Where the panel goes, measured as it opens (and again once its real height is known).
  useEffect(() => {
    if (!open || phone) {
      // Forgotten once closed, so the next opening never flashes at the old spot.
      const frame = requestAnimationFrame(() => setPos(null));
      return () => cancelAnimationFrame(frame);
    }
    const place = () => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const panelH = panelRef.current?.offsetHeight ?? PANEL_H;
      const width = Math.min(PANEL_W, window.innerWidth - 32);
      const left = Math.max(16, Math.min(box.left, window.innerWidth - width - 16));
      // The sticky bars' lower edge: the panel never goes under them.
      const navBottom = Math.max(0, ...[...document.querySelectorAll("[data-masthead-bar], [data-category-nav]")].map((el) => el.getBoundingClientRect().bottom));
      const below = box.bottom + 8;
      const above = box.top - 8 - panelH;
      if (below + panelH <= window.innerHeight - 8) setPos({ top: below, left, width, above: false });
      else if (above >= navBottom + 8) setPos({ top: above, left, width, above: true });
      else setPos({ top: Math.max(navBottom + 8, window.innerHeight - panelH - 8), left, width, above: false });
    };
    // Placed on the next frame, then once more when the panel has its real height.
    const frame = requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    window.addEventListener("resize", place);
    // A fixed panel wouldn't follow its tile down the page: it closes instead.
    const onScroll = () => onClose();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone, onClose]);

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(onClose, 160);
  };
  const onEnter = (event: PointerEvent) => {
    if (phone || event.pointerType !== "mouse") return;
    clearTimers();
    openTimer.current = setTimeout(onOpen, HOVER_OPEN_MS);
  };
  const onLeave = (event: PointerEvent) => {
    if (phone || event.pointerType !== "mouse") return;
    scheduleClose();
  };

  return (
    <div ref={ref} className="relative h-full" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open && !phone ? onClose() : onOpen())}
        className={cn(
          "card flex h-full w-full flex-col gap-3 p-4 text-left transition-[box-shadow,border-color,transform] duration-150 ease-snap sm:p-5",
          "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop focus-visible:border-brand motion-reduce:hover:translate-y-0",
          open && "border-brand/40 shadow-pop",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-wide text-[0.9375rem] font-extrabold text-ink">{quote.name}</span>
            <span className="block text-xs font-medium text-muted">{quote.unit}</span>
          </span>
          <LiveBadge open={quote.open} />
        </span>
        <span className="block font-wide text-[1.625rem] font-black leading-none tracking-tight text-ink tabular-nums sm:text-[1.75rem]">
          {money(quote.price, quote.currency)}
        </span>
        <Change quote={quote} />
        <span className="mt-auto flex items-end justify-between gap-3">
          <span className="flex flex-col gap-0.5 text-xs text-muted">
            <span className="flex gap-1.5">
              <span>Prev. close</span>
              <span className="font-semibold text-ink-2 tabular-nums">{number(quote.previousClose, quote.currency)}</span>
            </span>
            {quote.dayLow !== null && quote.dayHigh !== null && (
              <span className="flex gap-1.5">
                <span>Day</span>
                <span className="font-semibold text-ink-2 tabular-nums">
                  {number(quote.dayLow, quote.currency)} – {number(quote.dayHigh, quote.currency)}
                </span>
              </span>
            )}
          </span>
          <TrendLine values={quote.trend} up={!down} />
        </span>
        <span className="sr-only">{phone ? "Tap for the chart and details" : "Hover or click for the chart and details"}</span>
      </button>

      {/* Computers: the details over the page, above the sticky bars. */}
      {!phone &&
        isClient &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={`${quote.name} details`}
                initial={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") clearTimers();
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") scheduleClose();
                }}
                className="fixed z-70 rounded-2xl border border-border bg-surface p-4 shadow-pop"
                style={{ top: pos.top, left: pos.left, width: pos.width }}
              >
                <p className="mb-2 font-wide text-base font-extrabold text-ink">{quote.name}</p>
                <QuoteDetails quote={quote} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** Today's path so far: a small line in the move's colour over a faint fill. Decorative. */
function TrendLine({ values, up }: { values: number[]; up: boolean }) {
  const w = 96;
  const h = 32;
  if (values.length < 2) return <span aria-hidden className="block" style={{ width: w, height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const color = up ? "var(--success)" : "var(--brand)";
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block shrink-0 overflow-visible">
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
