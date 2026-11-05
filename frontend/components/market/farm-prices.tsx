"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { MandiCommodity, MandiGroup } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Farm prices on /market (owner 2026-11-05: "local market like CAMPCO arecanut price… agriculture market price"):
 * Karnataka APMC mandi prices from AGMARKNET (GET /api/market/mandi) — pick a crop, see every market that reported it:
 * the modal (most traded) price large, the day's min–max beside it, ₹ per quintal. Every crop the markets reported
 * (owner 2026-11-05: "add all market prices available"), in groups — plantation crops (arecanut, coconut, pepper…)
 * first — with a crop search across all of them. Left out entirely when the server has no data.gov.in key or nothing
 * was reported.
 */

const GROUP_LABELS: Record<MandiGroup, { en: string; kn: string }> = {
  plantation: { en: "Plantation", kn: "ತೋಟಗಾರಿಕೆ" },
  grains: { en: "Grains & pulses", kn: "ಧಾನ್ಯ, ಕಾಳು" },
  vegetables: { en: "Vegetables", kn: "ತರಕಾರಿ" },
  fruits: { en: "Fruits", kn: "ಹಣ್ಣು" },
  other: { en: "Other", kn: "ಇತರೆ" },
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (iso: string) => {
  const d = new Date(`${iso}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

/** Today's date in India, "YYYY-MM-DD". */
const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export function FarmPrices() {
  const { data } = useQuery({
    queryKey: qk.mandi,
    queryFn: ({ signal }) => api.mandi(signal),
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
  });
  const commodities = useMemo(() => (data?.configured ? data.commodities : []), [data]);
  const groups = useMemo(() => [...new Set(commodities.map((c) => c.group))], [commodities]);
  const [picked, setPicked] = useState<string | null>(null);
  const [group, setGroup] = useState<MandiGroup | null>(null);
  const [find, setFind] = useState("");
  const active = commodities.find((c) => c.id === picked) ?? commodities[0] ?? null;
  const activeGroup = group ?? active?.group ?? groups[0] ?? "plantation";
  const needle = find.trim().toLowerCase();
  // Searching looks across every crop; otherwise the chosen group's crops.
  const chips = needle
    ? commodities.filter((c) => `${c.name} ${c.nameKn}`.toLowerCase().includes(needle))
    : commodities.filter((c) => c.group === activeGroup);
  if (!active) return null;

  const pick = (c: MandiCommodity) => {
    setPicked(c.id);
    setGroup(c.group);
  };

  return (
    <section aria-labelledby="market-farm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="market-farm" className="flex items-center gap-2 font-wide text-lg font-extrabold text-ink">
            <Sprout aria-hidden className="size-5 text-success" />
            Farm prices · Karnataka APMC
          </h2>
          <p className="text-sm text-muted">
            The latest auction prices from {new Set(commodities.flatMap((c) => c.prices.map((p) => p.market))).size} APMC markets
            for {commodities.length} crops, ₹ per quintal — today&apos;s, or a market&apos;s last report this week. Modal is the price most of the produce sold at.
          </p>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-full border border-border-strong bg-surface px-3.5 text-sm focus-within:border-brand sm:w-72">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Find a crop</span>
          <input
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a crop · ಬೆಳೆ ಹುಡುಕಿ"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
        </label>
      </div>

      {!needle && (
        <div role="tablist" aria-label="Crop group" className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 [scrollbar-width:none] sm:self-start">
          {groups.map((g) => {
            const on = g === activeGroup;
            return (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setGroup(g);
                  const first = commodities.find((c) => c.group === g);
                  if (first) setPicked(first.id);
                }}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
                  on ? "bg-ink text-surface" : "text-ink-2 hover:bg-tint hover:text-brand",
                )}
              >
                {GROUP_LABELS[g].kn}
                <span className={cn("text-xs font-semibold", on ? "text-surface/70" : "text-muted")}>{GROUP_LABELS[g].en}</span>
              </button>
            );
          })}
        </div>
      )}

      <div role="tablist" aria-label="Crop" className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = c.id === active.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(c)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                on ? "border-brand bg-brand text-brand-contrast" : "border-border bg-surface text-ink-2 hover:border-brand/40 hover:text-brand",
              )}
            >
              {c.nameKn}
              {c.nameKn !== c.name && <span className={cn("text-xs font-semibold", on ? "text-brand-contrast/80" : "text-muted")}>{c.name}</span>}
              <span className={cn("rounded-full px-1.5 text-[0.6875rem] font-bold tabular-nums", on ? "bg-brand-contrast/20" : "bg-tint-2 text-muted")}>{c.prices.length}</span>
            </button>
          );
        })}
        {chips.length === 0 && <p className="py-2 text-sm text-muted">No crop matches “{find.trim()}” today.</p>}
      </div>

      <CommodityTable key={active.id} commodity={active} />
    </section>
  );
}

function CommodityTable({ commodity }: { commodity: MandiCommodity }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () => commodity.prices.filter((p) => !needle || `${p.market} ${p.district} ${p.variety}`.toLowerCase().includes(needle)),
    [commodity.prices, needle],
  );
  const top = commodity.prices.reduce((m, p) => Math.max(m, p.max), 0) || 1;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">
          <span className="font-bold text-ink">{commodity.prices.length}</span> market reports for {commodity.name.toLowerCase()}
        </p>
        <label className="flex h-9 w-full items-center gap-2 rounded-full border border-border-strong px-3 text-sm focus-within:border-brand sm:w-64">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Find a market</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a market or district"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No market matches “{query.trim()}”.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((p, i) => (
            <li key={`${p.market}-${p.variety}-${p.date}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-bold text-ink">{p.market}</p>
                <p className="truncate text-xs text-muted">
                  {p.district}
                  {p.variety && p.variety !== "Other" && <> · {p.variety}</>} ·{" "}
                  {p.date < todayIst() ? (
                    // A market that didn't report today shows its latest report (owner 2026-11-05: "where is Mangaluru?").
                    <span className="font-semibold text-amber-700">last report {day(p.date)}</span>
                  ) : (
                    day(p.date)
                  )}
                </p>
              </div>
              {/* Where the day's range sits against the highest price reported for this crop. */}
              <div aria-hidden className="relative hidden h-1.5 rounded-full bg-tint-2 sm:block">
                <span
                  className="absolute inset-y-0 rounded-full bg-success/40"
                  style={{ left: `${(p.min / top) * 100}%`, width: `${Math.max(((p.max - p.min) / top) * 100, 1)}%` }}
                />
                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success" style={{ left: `${(p.modal / top) * 100}%` }} />
              </div>
              <div className="text-right">
                <p className="font-wide text-lg font-black leading-none text-ink tabular-nums">{rupees(p.modal)}</p>
                <p className="mt-1 text-xs text-muted tabular-nums">
                  {rupees(p.min)} – {rupees(p.max)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
