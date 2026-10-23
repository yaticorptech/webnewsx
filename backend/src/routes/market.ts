import { Hono } from "hono";
import { cached } from "../lib/cache.js";
import { ApiError, validationError } from "../lib/errors.js";
import { MARKET_RANGE_VALUES, type MarketHistory, type MarketQuote, type MarketRange, type MarketResponse } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/*
 * GET /api/market (owner 2026-10-22: "live Nifty, Sensex, NSE, gold rate… all live market prices"): the Market page's
 * quotes — the NSE / BSE indices, gold and silver in rupees, crude oil, the rupee against the dollar and the euro, and
 * Bitcoin — from Yahoo Finance's public chart endpoint (no key; the numbers the Yahoo Finance site shows), refreshed
 * every QUOTES_TTL seconds and shared by everyone (lib/cache.ts), so a busy page costs the source one request a minute.
 * GET /api/market/history?id=&range= gives one quote's chart over the week or the month (today's points come with the
 * quote itself). Gold and silver are the world price (COMEX futures, dollars per troy ounce) converted at the live
 * USD/INR rate to ₹ per 10 g and ₹ per kg — the international rate, not a jeweller's board (that adds import duty, GST
 * and making). A symbol the source can't give is left out rather than failing the page; none at all is a 503.
 */

const QUOTES_TTL = 60;
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; WebNEWS market ticker)" };
const TIMEOUT_MS = 10_000;
const TROY_OUNCE_G = 31.1034768;
/** At most this many chart points per quote: plenty for a line, small on the wire. */
const MAX_POINTS = 120;

/** Yahoo's interval for each range, and how long a range's chart is kept. */
const RANGES: Record<MarketRange, { interval: string; ttl: number }> = {
  "1d": { interval: "5m", ttl: QUOTES_TTL },
  "5d": { interval: "30m", ttl: 300 },
  "1mo": { interval: "1d", ttl: 900 },
};

type Source = { id: string; symbol: string; group: MarketQuote["group"]; name: string; unit: string };

const SOURCES: Source[] = [
  { id: "nifty50", symbol: "^NSEI", group: "indices", name: "Nifty 50", unit: "NSE" },
  { id: "sensex", symbol: "^BSESN", group: "indices", name: "Sensex", unit: "BSE" },
  { id: "banknifty", symbol: "^NSEBANK", group: "indices", name: "Bank Nifty", unit: "NSE" },
  { id: "niftyit", symbol: "^CNXIT", group: "indices", name: "Nifty IT", unit: "NSE" },
  { id: "niftynext50", symbol: "^NSMIDCP", group: "indices", name: "Nifty Next 50", unit: "NSE" },
  { id: "gold", symbol: "GC=F", group: "commodities", name: "Gold", unit: "₹ per 10 g" },
  { id: "silver", symbol: "SI=F", group: "commodities", name: "Silver", unit: "₹ per kg" },
  { id: "crude", symbol: "BZ=F", group: "commodities", name: "Crude oil (Brent)", unit: "$ per barrel" },
  { id: "usdinr", symbol: "INR=X", group: "currency", name: "US dollar", unit: "₹ per $" },
  { id: "eurinr", symbol: "EURINR=X", group: "currency", name: "Euro", unit: "₹ per €" },
  { id: "bitcoin", symbol: "BTC-INR", group: "crypto", name: "Bitcoin", unit: "₹ per BTC" },
];

/** ₹ per 10 g of gold / ₹ per kg of silver from the world price ($ per troy ounce) at `usdInr`. */
const RUPEE_FACTOR: Record<string, (usdInr: number) => number> = {
  gold: (usdInr) => (usdInr * 10) / TROY_OUNCE_G,
  silver: (usdInr) => (usdInr * 1000) / TROY_OUNCE_G,
};

type Chart = {
  chart?: {
    result?: {
      meta: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketTime?: number;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
  };
};

type Series = { meta: NonNullable<NonNullable<Chart["chart"]>["result"]>[number]["meta"]; points: { t: number; v: number }[] };

/** One Yahoo chart: the quote's meta and its (time, close) points, oldest first, thinned to MAX_POINTS. Null on any failure. */
async function fetchSeries(symbol: string, range: MarketRange): Promise<Series | null> {
  try {
    const url = `${YAHOO}${encodeURIComponent(symbol)}?range=${range}&interval=${RANGES[range].interval}&includePrePost=false`;
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = (await response.json()) as Chart;
    const result = data.chart?.result?.[0];
    if (!result?.meta) return null;
    const times = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points: { t: number; v: number }[] = [];
    closes.forEach((v, i) => {
      const t = times[i];
      if (typeof v === "number" && v > 0 && typeof t === "number") points.push({ t, v });
    });
    return { meta: result.meta, points: thin(points, MAX_POINTS) };
  } catch {
    return null;
  }
}

function thin<T>(values: T[], max: number): T[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  const out = Array.from({ length: max }, (_, i) => values[Math.min(values.length - 1, Math.floor(i * step))] as T);
  out[out.length - 1] = values[values.length - 1] as T; // always the latest point
  return out;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Decimals shown: indices, currencies and dollar prices to the paisa / cent; the big rupee amounts (gold, silver, Bitcoin) whole. */
function digitsFor(source: Source): number {
  return source.unit.startsWith("$") || source.group === "indices" || source.group === "currency" ? 2 : 0;
}

/** The rupee conversion for gold / silver (1 for everything else); null when it can't be done (no dollar rate). */
function factorFor(source: Source, usdInr: number | null): number | null {
  const factor = RUPEE_FACTOR[source.id];
  if (!factor) return 1;
  return usdInr === null ? null : factor(usdInr);
}

function toQuote(source: Source, series: Series, usdInr: number | null): MarketQuote | null {
  const k = factorFor(source, usdInr);
  const meta = series.meta;
  const rawPrice = meta.regularMarketPrice;
  const rawPrev = meta.chartPreviousClose ?? meta.previousClose;
  if (k === null || typeof rawPrice !== "number" || typeof rawPrev !== "number" || !(rawPrice > 0) || !(rawPrev > 0)) return null;
  const digits = digitsFor(source);
  const price = rawPrice * k;
  const previousClose = rawPrev * k;
  const now = Date.now() / 1000;
  const regular = meta.currentTradingPeriod?.regular;
  const open = typeof regular?.start === "number" && typeof regular?.end === "number" && now >= regular.start && now <= regular.end;
  return {
    id: source.id,
    group: source.group,
    name: source.name,
    unit: source.unit,
    currency: source.unit.startsWith("$") ? "USD" : "INR",
    price: round(price, digits),
    previousClose: round(previousClose, digits),
    change: round(price - previousClose, digits),
    changePercent: round(((price - previousClose) / previousClose) * 100, 2),
    dayHigh: typeof meta.regularMarketDayHigh === "number" ? round(meta.regularMarketDayHigh * k, digits) : null,
    dayLow: typeof meta.regularMarketDayLow === "number" ? round(meta.regularMarketDayLow * k, digits) : null,
    fiftyTwoWeekHigh: typeof meta.fiftyTwoWeekHigh === "number" ? round(meta.fiftyTwoWeekHigh * k, digits) : null,
    fiftyTwoWeekLow: typeof meta.fiftyTwoWeekLow === "number" ? round(meta.fiftyTwoWeekLow * k, digits) : null,
    trend: series.points.map((p) => round(p.v * k, digits)),
    times: series.points.map((p) => p.t),
    open,
    updatedAt: new Date((meta.regularMarketTime ?? now) * 1000).toISOString(),
  };
}

async function loadQuotes(): Promise<MarketResponse> {
  const series = await Promise.all(SOURCES.map((source) => fetchSeries(source.symbol, "1d")));
  const usdInr = series[SOURCES.findIndex((source) => source.id === "usdinr")]?.meta.regularMarketPrice ?? null;
  const quotes = SOURCES.flatMap((source, i) => {
    const s = series[i];
    return s ? (toQuote(source, s, usdInr) ?? []) : [];
  });
  if (quotes.length === 0) throw new ApiError(503, "market_unavailable", "Market prices aren't available right now. Try again in a minute.");
  return { quotes, fetchedAt: new Date().toISOString() };
}

const quotes = () => cached("market:quotes", QUOTES_TTL, loadQuotes);

async function loadHistory(source: Source, range: MarketRange): Promise<MarketHistory> {
  const [series, current] = await Promise.all([fetchSeries(source.symbol, range), RUPEE_FACTOR[source.id] ? quotes() : null]);
  const usdInr = current?.quotes.find((quote) => quote.id === "usdinr")?.price ?? null;
  const k = factorFor(source, usdInr);
  if (!series || k === null) throw new ApiError(503, "market_unavailable", "That chart isn't available right now. Try again in a minute.");
  const digits = digitsFor(source);
  const rawPrev = series.meta.chartPreviousClose ?? series.meta.previousClose;
  return {
    id: source.id,
    range,
    points: series.points.map((p) => ({ t: p.t, v: round(p.v * k, digits) })),
    previousClose: typeof rawPrev === "number" && rawPrev > 0 ? round(rawPrev * k, digits) : null,
  };
}

const isRange = (value: string | undefined): value is MarketRange => (MARKET_RANGE_VALUES as readonly string[]).includes(value ?? "");

export function marketRoutes() {
  const app = new Hono<AppEnv>();
  // GET /api/market — the live quotes with today's chart points, one source round per minute for everyone.
  app.get("/", async (c) => c.json(await quotes()));
  // GET /api/market/history?id=nifty50&range=5d|1mo — one quote's chart over a longer range.
  app.get("/history", async (c) => {
    const source = SOURCES.find((s) => s.id === c.req.query("id"));
    const range = c.req.query("range");
    if (!source) throw validationError({ id: "Unknown quote" });
    if (!isRange(range)) throw validationError({ range: "Unknown range" });
    return c.json(await cached(`market:history:${source.id}:${range}`, RANGES[range].ttl, () => loadHistory(source, range)));
  });
  return app;
}
