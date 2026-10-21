"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { ReporterMark } from "@/components/feed/story-badges";
import type { AuthorSummary, ReporterLevel } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Pieces shared by the membership dashboards (owner 2026-10-15): Settings → My memberships, Settings → Premium
 * membership (earnings) and Desk → Memberships.
 */

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" });

/** 552000 → "₹5,520"; 5520 → "₹55.2". */
export const inr = (paise: number) => RUPEES.format(paise / 100);
export const dateText = (isoDate: string) => DATE.format(new Date(isoDate));
const DAY_MS = 86_400_000;
export const daysLeft = (isoDate: string) => Math.max(0, Math.ceil((Date.parse(isoDate) - Date.now()) / DAY_MS));

/** A big number with its label (and a quiet line under it). */
export function StatTile({ label, value, hint, tone = "plain", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "plain" | "brand" | "good" | "warn"; icon?: ReactNode }) {
  return (
    // Neutral cards (owner 2026-10-16: professional, not full of colours); a tone is only a small dot by the label.
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted [&_svg]:size-3.5 [&_svg]:text-faint">
        {icon}
        {label}
        {tone !== "plain" && (
          <span aria-hidden className={cn("ml-auto size-1.5 rounded-full", tone === "brand" ? "bg-brand" : tone === "good" ? "bg-[#3fa22b]" : "bg-[#d99a00]")} />
        )}
      </span>
      <span className="truncate text-2xl font-semibold tabular-nums leading-tight tracking-[-0.01em] text-ink">{value}</span>
      {hint && <span className="truncate text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Active / Expired. */
export function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-extrabold uppercase tracking-wide",
        active ? "bg-[#e8f6e2] text-[#2f7a1f]" : "bg-surface-2 text-muted",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", active ? "bg-[#3fa22b]" : "bg-muted")} />
      {active ? "Active" : "Expired"}
    </span>
  );
}

/** "Test" — a development payment, no money moved. */
export function TestChip() {
  return (
    <span title="A development test payment — no money moved" className="inline-flex h-5 items-center rounded-md bg-[#fff1d6] px-1.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-[#9a6200]">
      Test
    </span>
  );
}

/** The share of the membership's 30 days still left, as a bar. */
export function ValidityBar({ until, days = 30 }: { until: string; days?: number }) {
  const left = daysLeft(until);
  const share = Math.min(1, left / days);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", left <= 3 ? "bg-[#e5534b]" : left <= 7 ? "bg-[#f2a33a]" : "bg-[#3fa22b]")} style={{ width: `${share * 100}%` }} />
      </div>
      <span className="text-xs text-muted">
        {left > 0 ? `${left} day${left === 1 ? "" : "s"} left · until ${dateText(until)}` : `Ended ${dateText(until)}`}
      </span>
    </div>
  );
}

/** Six months of earnings as bars (IST months), the latest highlighted. */
export function MonthlyBars({ data, label = "Earnings by month" }: { data: { month: string; netPaise: number; payments: number }[]; label?: string }) {
  const max = Math.max(1, ...data.map((d) => d.netPaise));
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-bold text-ink">{label}</figcaption>
      <div className="flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={data.map((d) => `${d.month}: ${inr(d.netPaise)}`).join(", ")}>
        {data.map((d, index) => {
          const latest = index === data.length - 1;
          return (
            <div key={d.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className={cn("text-[0.6875rem] font-bold tabular-nums", latest ? "text-brand" : "text-muted")}>{d.netPaise > 0 ? inr(d.netPaise) : ""}</span>
              <div
                className={cn("w-full max-w-12 rounded-t-lg", latest ? "bg-brand" : "bg-tint-border")}
                style={{ height: `${Math.max(d.netPaise > 0 ? 6 : 2, (d.netPaise / max) * 100)}%` }}
              />
              <span className="text-[0.6875rem] font-semibold text-muted">{MONTH.format(new Date(`${d.month}-15T00:00:00Z`))}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/** Photo, name ✓ and @handle; links to the profile. */
export function PersonLine({ person, level, href, size = 36 }: { person: AuthorSummary; level?: ReporterLevel | null; href?: string | null; size?: number }) {
  const body = (
    <>
      <Avatar src={person.image} name={person.name} size={size} decorative className="ring-1 ring-border" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-bold text-ink">{person.name}</span>
          {level && <ReporterMark level={level} size={13} focusable={false} />}
        </span>
        {person.username && <span className="truncate text-xs text-muted">@{person.username}</span>}
      </span>
    </>
  );
  const target = href === undefined ? (person.username ? `/${person.username}` : null) : href;
  return target ? (
    <Link href={target} className="flex min-w-0 items-center gap-2.5 hover:[&_span.font-bold]:text-brand">
      {body}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2.5">{body}</span>
  );
}

/** A titled block inside a dashboard. */
export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)]", className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

/** A simple bordered table that scrolls sideways on narrow screens. */
export function SimpleTable({ head, children, empty }: { head: string[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-[#fafafa]">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 text-xs font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

/**
 * Long lists show their first `limit` rows, then "View all (N)" / "Show less" (owner 2026-10-16: Analytics showed every
 * row at once). Returns the rows to draw and the button to put under them (null when everything already fits).
 */
export function useShowMore<T>(items: readonly T[], limit = 6): { shown: readonly T[]; more: ReactNode } {
  const [all, setAll] = useState(false);
  if (items.length <= limit) return { shown: items, more: null };
  return {
    shown: all ? items : items.slice(0, limit),
    more: (
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        aria-expanded={all}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {all ? "Show less" : `View all (${items.length})`}
      </button>
    ),
  };
}
