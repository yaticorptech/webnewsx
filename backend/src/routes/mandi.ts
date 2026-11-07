import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { mandiPrice } from "../db/schema.js";
import { cached, invalidate } from "../lib/cache.js";
import { env } from "../env.js";
import type { MandiCommodity, MandiGroup, MandiPrice, MandiResponse } from "../shared/contracts.js";

/*
 * GET /api/market/mandi (owner 2026-11-05: "in market add local market like CAMPCO arecanut price… add all market
 * prices available in this API"): every Karnataka APMC price in AGMARKNET's "Current daily price of various commodities
 * from various markets (Mandi)" on data.gov.in — the government's free open-data API (key: DATA_GOV_IN_API_KEY). CAMPCO
 * publishes no API; its buying rate follows these APMC auctions. Every fetch is kept (mandi_price), and the page shows
 * each market's latest report from the last HISTORY_DAYS days with its date — a market that didn't report today (e.g.
 * Mangaluru) still appears. Grouped (plantation crops first for the coast), ₹ per quintal; refreshed every MANDI_TTL
 * seconds for everyone.
 */

const HISTORY_DAYS = 7;

const MANDI_TTL = 30 * 60;
const RESOURCE = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
const STATE = "Karnataka";
const PAGE = 1000;
const MAX_PAGES = 10;

/**
 * AGMARKNET commodity name → how the page shows it (English, Kannada, group). Order here = order on the page within a
 * group. A crop not listed still shows (its AGMARKNET name, group "other").
 */
const KNOWN: [agmark: string, name: string, nameKn: string, group: MandiGroup][] = [
  ["Arecanut(Betelnut/Supari)", "Arecanut", "ಅಡಿಕೆ", "plantation"],
  ["Coconut", "Coconut", "ತೆಂಗಿನಕಾಯಿ", "plantation"],
  ["Copra", "Copra", "ಕೊಬ್ಬರಿ", "plantation"],
  ["Tender Coconut", "Tender coconut", "ಎಳನೀರು", "plantation"],
  ["Black pepper", "Black pepper", "ಕಾಳುಮೆಣಸು", "plantation"],
  ["Cardamoms", "Cardamom", "ಏಲಕ್ಕಿ", "plantation"],
  ["Coffee", "Coffee", "ಕಾಫಿ", "plantation"],
  ["Rubber", "Rubber", "ರಬ್ಬರ್", "plantation"],
  ["Cashewnuts", "Cashew", "ಗೋಡಂಬಿ", "plantation"],
  ["Gur(Jaggery)", "Jaggery", "ಬೆಲ್ಲ", "plantation"],
  ["Turmeric", "Turmeric", "ಅರಿಶಿನ", "plantation"],
  ["Cotton", "Cotton", "ಹತ್ತಿ", "plantation"],
  ["Lint", "Cotton lint", "ಅರಳೆ", "plantation"],
  ["Paddy(Common)", "Paddy", "ಭತ್ತ", "grains"],
  ["Paddy(Dhan)(Common)", "Paddy", "ಭತ್ತ", "grains"],
  ["Rice", "Rice", "ಅಕ್ಕಿ", "grains"],
  ["Ragi(Finger Millet)", "Ragi", "ರಾಗಿ", "grains"],
  ["Ragi (Finger Millet)", "Ragi", "ರಾಗಿ", "grains"],
  ["Maize", "Maize", "ಮೆಕ್ಕೆಜೋಳ", "grains"],
  ["Jowar(Sorghum)", "Jowar", "ಜೋಳ", "grains"],
  ["Wheat", "Wheat", "ಗೋಧಿ", "grains"],
  ["Bajra(Pearl Millet/Cumbu)", "Bajra", "ಸಜ್ಜೆ", "grains"],
  ["Sajje", "Sajje", "ಸಜ್ಜೆ", "grains"],
  ["Red gram/Arhar/Tur(whole)", "Tur (red gram)", "ತೊಗರಿ", "grains"],
  ["Bengal Gram(Gram)(Whole)", "Bengal gram", "ಕಡಲೆ", "grains"],
  ["Green Gram(Moong)(Whole)", "Green gram", "ಹೆಸರುಕಾಳು", "grains"],
  ["Black Gram(Urd Beans)(Whole)", "Black gram", "ಉದ್ದು", "grains"],
  ["Horse Gram", "Horse gram", "ಹುರುಳಿ", "grains"],
  ["Ground Nut Seed", "Groundnut", "ಶೇಂಗಾ", "grains"],
  ["Groundnut", "Groundnut", "ಶೇಂಗಾ", "grains"],
  ["Soyabean", "Soybean", "ಸೋಯಾಬೀನ್", "grains"],
  ["Sunflower/Sunflower Seed", "Sunflower seed", "ಸೂರ್ಯಕಾಂತಿ", "grains"],
  ["Kulthi(Horse Gram)", "Horse gram", "ಹುರುಳಿ", "grains"],
  ["Alasande Gram", "Cowpea (alasande)", "ಅಲಸಂದೆ ಕಾಳು", "grains"],
  ["Mustard", "Mustard", "ಸಾಸಿವೆ", "grains"],
  ["Red gram split/Arhar dal/Tur dal", "Tur dal", "ತೊಗರಿ ಬೇಳೆ", "grains"],
  ["Black Gram Dal(Urd Dal)", "Urad dal", "ಉದ್ದಿನ ಬೇಳೆ", "grains"],
  ["Green Gram Dal(Moong Dal)", "Moong dal", "ಹೆಸರು ಬೇಳೆ", "grains"],
  ["Avare Dal", "Avare dal", "ಅವರೆ ಬೇಳೆ", "grains"],
  ["Chennangi Dal", "Chennangi dal", "ಚೆನ್ನಂಗಿ ಬೇಳೆ", "grains"],
  ["Onion", "Onion", "ಈರುಳ್ಳಿ", "vegetables"],
  ["Green Peas", "Green peas", "ಹಸಿ ಬಟಾಣಿ", "vegetables"],
  ["Tomato", "Tomato", "ಟೊಮೆಟೊ", "vegetables"],
  ["Potato", "Potato", "ಆಲೂಗಡ್ಡೆ", "vegetables"],
  ["Green Chilli", "Green chilli", "ಹಸಿಮೆಣಸಿನಕಾಯಿ", "vegetables"],
  ["Dry Chillies", "Dry chilli", "ಒಣಮೆಣಸಿನಕಾಯಿ", "vegetables"],
  ["Brinjal", "Brinjal", "ಬದನೆಕಾಯಿ", "vegetables"],
  ["Beans", "Beans", "ಹುರುಳಿಕಾಯಿ", "vegetables"],
  ["Ladies Finger", "Okra", "ಬೆಂಡೆಕಾಯಿ", "vegetables"],
  ["Cabbage", "Cabbage", "ಎಲೆಕೋಸು", "vegetables"],
  ["Cauliflower", "Cauliflower", "ಹೂಕೋಸು", "vegetables"],
  ["Carrot", "Carrot", "ಕ್ಯಾರೆಟ್", "vegetables"],
  ["Beetroot", "Beetroot", "ಬೀಟ್‌ರೂಟ್", "vegetables"],
  ["Raddish", "Radish", "ಮೂಲಂಗಿ", "vegetables"],
  ["Cucumbar(Kheera)", "Cucumber", "ಸೌತೆಕಾಯಿ", "vegetables"],
  ["Ridgeguard(Tori)", "Ridge gourd", "ಹೀರೆಕಾಯಿ", "vegetables"],
  ["Bitter gourd", "Bitter gourd", "ಹಾಗಲಕಾಯಿ", "vegetables"],
  ["Bottle gourd", "Bottle gourd", "ಸೋರೆಕಾಯಿ", "vegetables"],
  ["Snakeguard", "Snake gourd", "ಪಡವಲಕಾಯಿ", "vegetables"],
  ["Sweet Pumpkin", "Sweet pumpkin", "ಸಿಹಿಕುಂಬಳಕಾಯಿ", "vegetables"],
  ["Knool Khol", "Knol khol", "ನವಿಲುಕೋಸು", "vegetables"],
  ["Drumstick", "Drumstick", "ನುಗ್ಗೆಕಾಯಿ", "vegetables"],
  ["Capsicum", "Capsicum", "ದಪ್ಪ ಮೆಣಸಿನಕಾಯಿ", "vegetables"],
  ["Chilly Capsicum", "Chilli capsicum", "ದಪ್ಪ ಮೆಣಸಿನಕಾಯಿ", "vegetables"],
  ["Cowpea(Veg)", "Cowpea", "ಅಲಸಂದೆ", "vegetables"],
  ["Chapparad Avare", "Flat beans", "ಚಪ್ಪರದ ಅವರೆ", "vegetables"],
  ["Thondekai", "Ivy gourd", "ತೊಂಡೆಕಾಯಿ", "vegetables"],
  ["Seemebadnekai", "Chayote", "ಸೀಮೆಬದನೆಕಾಯಿ", "vegetables"],
  ["Thogrikai", "Tur pods", "ತೊಗರಿಕಾಯಿ", "vegetables"],
  ["Ginger(Green)", "Ginger", "ಹಸಿ ಶುಂಠಿ", "vegetables"],
  ["Garlic", "Garlic", "ಬೆಳ್ಳುಳ್ಳಿ", "vegetables"],
  ["Banana", "Banana", "ಬಾಳೆಹಣ್ಣು", "fruits"],
  ["Banana - Green", "Raw banana", "ಬಾಳೆಕಾಯಿ", "fruits"],
  ["Lime", "Lime", "ನಿಂಬೆಹಣ್ಣು", "fruits"],
  ["Mango", "Mango", "ಮಾವು", "fruits"],
  ["Pomegranate", "Pomegranate", "ದಾಳಿಂಬೆ", "fruits"],
  ["Grapes", "Grapes", "ದ್ರಾಕ್ಷಿ", "fruits"],
  ["Papaya", "Papaya", "ಪಪ್ಪಾಯಿ", "fruits"],
  ["Tamarind Fruit", "Tamarind", "ಹುಣಸೆಹಣ್ಣು", "fruits"],
  ["Dry Grapes", "Raisins", "ಒಣದ್ರಾಕ್ಷಿ", "fruits"],
];
const KNOWN_BY_NAME = new Map(KNOWN.map(([agmark, name, nameKn, group], rank) => [agmark.toLowerCase(), { name, nameKn, group, rank }]));
const GROUP_ORDER: MandiGroup[] = ["plantation", "grains", "vegetables", "fruits", "other"];

type Row = { district?: string; market?: string; commodity?: string; variety?: string; arrival_date?: string; min_price?: string | number; max_price?: string | number; modal_price?: string | number };

/** "05/11/2026" → "2026-11-05". */
const isoDate = (d: string | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (d ?? "");
};
const num = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clean = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
/** "APMC THIRTHAHALLI" → "Thirthahalli APMC", like the other markets' names. */
const marketName = (s: string | undefined) => {
  let name = clean(s);
  if (name === name.toUpperCase()) name = name.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace(/\bApmc\b/g, "APMC");
  return name.replace(/^APMC\s+(.+)$/, "$1 APMC");
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Where to ask: data.gov.in itself, then the site's Mumbai relay (frontend app/relay/mandi). data.gov.in doesn't answer
 * the live API server (Railway, Europe) — owner 2026-11-07: the Market page showed no arecanut / coconut prices.
 */
const SOURCES = [
  (params: URLSearchParams) => `${RESOURCE}?${params}`,
  (params: URLSearchParams) => `${env.FRONTEND_URL.replace(/\/+$/, "")}/relay/mandi?${params}`,
];

/** One page of records, or null when this source can't be reached. */
async function fetchPage(source: (p: URLSearchParams) => string, key: string, page: number): Promise<{ records: Row[]; total: number } | null> {
  const params = new URLSearchParams({ "api-key": key, format: "json", limit: String(PAGE), offset: String(page * PAGE), "filters[state.keyword]": STATE });
  const res = await fetch(source(params), { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { records?: Row[]; total?: number } | null;
  return data?.records ? { records: data.records, total: data.total ?? 0 } : null;
}

/** Every Karnataka record of the day (paged: the API returns at most PAGE rows a call), from the first source that answers. */
async function fetchAll(key: string): Promise<Row[]> {
  for (const [i, source] of SOURCES.entries()) {
    const rows: Row[] = [];
    let reached = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchPage(source, key, page);
      if (!data) break;
      reached = true;
      rows.push(...data.records);
      if (data.records.length < PAGE || rows.length >= data.total) break;
    }
    if (reached) return rows;
    console.warn(`[mandi] ${i === 0 ? "data.gov.in" : "the Mumbai relay"} did not answer${i === 0 ? "; trying the relay" : ""}`);
  }
  return [];
}

type Report = { commodity: string; price: MandiPrice };

/** Today's reports from the API, as rows. */
function toReports(rows: Row[]): Report[] {
  return rows.flatMap((r) => {
    const commodity = clean(r.commodity);
    const price: MandiPrice = { market: marketName(r.market), district: clean(r.district), variety: clean(r.variety), min: num(r.min_price), max: num(r.max_price), modal: num(r.modal_price), date: isoDate(r.arrival_date) };
    return commodity && price.market && price.modal > 0 && /^\d{4}-\d{2}-\d{2}$/.test(price.date) ? [{ commodity, price }] : [];
  });
}

/** Keeps today's reports, then reads each market's latest report per crop and variety from the last HISTORY_DAYS days. */
async function withHistory(fresh: Report[]): Promise<Report[]> {
  if (fresh.length > 0) {
    await db
      .insert(mandiPrice)
      .values(
        fresh.map(({ commodity, price }) => ({
          date: price.date,
          market: price.market,
          commodity,
          variety: price.variety,
          district: price.district,
          minPrice: Math.round(price.min),
          maxPrice: Math.round(price.max),
          modalPrice: Math.round(price.modal),
        })),
      )
      .onConflictDoUpdate({
        target: [mandiPrice.date, mandiPrice.market, mandiPrice.commodity, mandiPrice.variety],
        set: { district: sql`excluded.district`, minPrice: sql`excluded.min_price`, maxPrice: sql`excluded.max_price`, modalPrice: sql`excluded.modal_price`, updatedAt: sql`now()` },
      });
  }
  const rows = await db.execute<{ date: string; market: string; commodity: string; variety: string; district: string; min_price: number; max_price: number; modal_price: number }>(sql`
    select distinct on (commodity, market, variety) date::text as date, market, commodity, variety, district, min_price, max_price, modal_price
    from mandi_price
    where date >= (now() at time zone 'Asia/Kolkata')::date - ${HISTORY_DAYS}::int
    order by commodity, market, variety, date desc`);
  return rows.map((r) => ({
    commodity: r.commodity,
    price: { market: r.market, district: r.district, variety: r.variety, min: r.min_price, max: r.max_price, modal: r.modal_price, date: r.date },
  }));
}

async function loadMandi(key: string): Promise<MandiResponse> {
  const fresh = toReports(await fetchAll(key));
  // The history table is a bonus: if it can't be reached, today's reports still show.
  const reports = await withHistory(fresh).catch(() => fresh);
  const byCommodity = new Map<string, { info: { name: string; nameKn: string; group: MandiGroup; rank: number }; prices: MandiPrice[] }>();
  for (const { commodity, price } of reports) {
    const info = KNOWN_BY_NAME.get(commodity.toLowerCase()) ?? { name: commodity, nameKn: commodity, group: "other" as const, rank: KNOWN.length };
    // Two AGMARKNET spellings of one crop (e.g. "Paddy(Common)" / "Paddy(Dhan)(Common)") share one tab.
    const id = slug(info.name);
    const entry = byCommodity.get(id) ?? { info, prices: [] };
    entry.prices.push(price);
    byCommodity.set(id, entry);
  }
  const commodities: MandiCommodity[] = [...byCommodity.entries()]
    .map(([id, { info, prices }]) => ({
      id,
      name: info.name,
      nameKn: info.nameKn,
      group: info.group,
      rank: info.rank,
      // Today's first, then by market.
      prices: prices.sort((a, b) => b.date.localeCompare(a.date) || a.market.localeCompare(b.market) || b.modal - a.modal),
    }))
    // Group order, then the list's order (known crops), then the most-reported first.
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.rank - b.rank || b.prices.length - a.prices.length)
    .map(({ rank: _rank, ...c }) => c);
  // Nothing at all (the API down and no history yet): not cached, so the next visit tries again.
  if (commodities.length === 0) throw new Error("mandi: no reports");
  return { configured: true, commodities, fetchedAt: new Date().toISOString() };
}

export async function mandiPrices(): Promise<MandiResponse> {
  const key = env.DATA_GOV_IN_API_KEY;
  if (!key) return { configured: false, commodities: [], fetchedAt: new Date().toISOString() };
  return cached("market:mandi", MANDI_TTL, () => loadMandi(key)).catch(() => ({ configured: true, commodities: [], fetchedAt: new Date().toISOString() }));
}

/**
 * Keeps the farm-price history filling through the day even when nobody opens /market (APMCs report at different
 * hours): fetches fresh reports every MANDI_TTL seconds. Off without a key. Returns a stop function.
 */
export function startMandiCollector(): () => void {
  const key = env.DATA_GOV_IN_API_KEY;
  if (!key) return () => {};
  // A fresh load replaces the cached answer (and saves the day's new reports).
  const run = () =>
    void invalidate("market:mandi")
      .then(() => cached("market:mandi", MANDI_TTL, () => loadMandi(key)))
      .catch(() => {});
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, MANDI_TTL * 1000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
