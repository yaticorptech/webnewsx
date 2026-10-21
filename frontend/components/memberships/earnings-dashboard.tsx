"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Crown, HandCoins, Landmark, RotateCcw, UsersRound, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { EmptyNote, MonthlyBars, Panel, PersonLine, SimpleTable, StatTile, StatusChip, TestChip, dateText, inr } from "./dashboard-parts";

type Tab = "members" | "payments" | "payouts";

/**
 * Settings → Premium membership, under the price (owner 2026-10-15): the reporter's members and money — active and
 * total members, earnings after WebNEWS's fee, what's been paid out and what's still due, six months of earnings, then
 * Members · Payments · Payouts.
 */
export function EarningsDashboard() {
  const query = useQuery({ queryKey: qk.membershipEarnings, queryFn: ({ signal }) => api.memberships.earnings(signal) });
  const [tab, setTab] = useState<Tab>("members");

  if (query.isPending) {
    return (
      <div aria-hidden className="card flex flex-col gap-4 px-5 py-6 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
        <p className="text-sm text-muted">Couldn&rsquo;t load your earnings. {errorMessage(query.error)}</p>
        <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const e = query.data;
  const thisMonth = e.monthly.at(-1)?.netPaise ?? 0;
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "members", label: "Members", count: e.members.length },
    { value: "payments", label: "Payments", count: e.recent.length },
    { value: "payouts", label: "Payouts", count: e.payouts.length },
  ];

  return (
    <section aria-labelledby="earnings-heading" className="card flex flex-col gap-6 px-5 py-6 sm:px-8">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
          <HandCoins />
        </span>
        <div className="min-w-0">
          <h2 id="earnings-heading" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
            Members &amp; earnings
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Who joined your membership and what you&rsquo;ve earned. Your share is the price minus WebNEWS&rsquo;s {e.feePercent}% fee; the Editor
            Desk pays it out to you.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active members" value={e.activeMembers} hint={`${e.totalMembers} joined in all`} tone={e.activeMembers > 0 ? "good" : "plain"} icon={<UsersRound aria-hidden />} />
        <StatTile label="Your earnings" value={inr(e.netPaise)} hint={`${inr(thisMonth)} this month`} tone="brand" icon={<Wallet aria-hidden />} />
        <StatTile label="Paid out to you" value={inr(e.paidOutPaise)} hint={e.payouts[0] ? `Last on ${dateText(e.payouts[0].paidAt)}` : "No payouts yet"} icon={<Landmark aria-hidden />} />
        <StatTile label="Balance due" value={inr(e.balancePaise)} hint="Still to be paid to you" tone={e.balancePaise > 0 ? "warn" : "plain"} icon={<Banknote aria-hidden />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border p-4">
          <MonthlyBars data={e.monthly} label="Your earnings, last 6 months" />
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-border p-4 text-sm">
          <p className="font-bold text-ink">How it adds up</p>
          <Row label="Members paid" value={inr(e.grossPaise)} />
          <Row label={`WebNEWS fee (${e.feePercent}%)`} value={`− ${inr(e.feePaise)}`} muted />
          <Row label="Your earnings" value={inr(e.netPaise)} strong />
          <Row label="Paid out" value={`− ${inr(e.paidOutPaise)}`} muted />
          <Row label="Balance due" value={inr(e.balancePaise)} strong brand />
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Crown aria-hidden className="size-3.5 text-amber-500" />
            {e.priceInr !== null ? `Your price: ₹${e.priceInr} a month` : "Set a price above to offer memberships"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label="Membership details" className="flex gap-1 rounded-xl bg-surface-2 p-1 sm:w-fit">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex-1 rounded-lg px-4 py-1.5 text-sm font-bold transition-colors sm:flex-none",
                tab === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t.label} <span className="tabular-nums text-muted">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "members" &&
          (e.members.length === 0 ? (
            <EmptyNote>No members yet. Tick &ldquo;Premium&rdquo; when you publish to start your members-only stories.</EmptyNote>
          ) : (
            <SimpleTable head={["Member", "Status", "Member since", "Valid until", "Payments", "You earned"]}>
              {e.members.map((m) => (
                <tr key={m.member.id}>
                  <td className="px-4 py-2.5">
                    <PersonLine person={m.member} size={30} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip active={m.active} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(m.memberSince)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(m.validUntil)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{m.payments}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(m.netPaise)}</td>
                </tr>
              ))}
            </SimpleTable>
          ))}

        {tab === "payments" &&
          (e.recent.length === 0 ? (
            <EmptyNote>No payments yet.</EmptyNote>
          ) : (
            <Panel title="Latest payments">
              <SimpleTable head={["Date", "Member", "Paid", "Fee", "You earned", ""]}>
                {e.recent.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(p.paidAt)}</td>
                    <td className="px-4 py-2.5">
                      <PersonLine person={p.member} size={28} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{inr(p.amountPaise)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">− {inr(p.feePaise)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(p.netPaise)}</td>
                    <td className="px-4 py-2.5">{p.provider === "test" && <TestChip />}</td>
                  </tr>
                ))}
              </SimpleTable>
            </Panel>
          ))}

        {tab === "payouts" &&
          (e.payouts.length === 0 ? (
            <EmptyNote>No payouts yet. When the Editor Desk sends you money, it shows here with its reference.</EmptyNote>
          ) : (
            <SimpleTable head={["Paid on", "Amount", "Reference", "Note"]}>
              {e.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(p.paidAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(p.amountPaise)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.reference ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{p.note ?? "—"}</td>
                </tr>
              ))}
            </SimpleTable>
          ))}
      </div>
    </section>
  );
}

function Row({ label, value, muted, strong, brand }: { label: string; value: string; muted?: boolean; strong?: boolean; brand?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", strong && "border-t border-border pt-2")}>
      <span className={cn(muted ? "text-muted" : "text-ink-2", strong && "font-bold text-ink")}>{label}</span>
      <span className={cn("tabular-nums", muted && "text-muted", strong && "font-extrabold", brand ? "text-brand" : "text-ink")}>{value}</span>
    </div>
  );
}
