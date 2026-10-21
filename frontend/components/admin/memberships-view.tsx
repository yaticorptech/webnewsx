"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CircleAlert, Crown, Landmark, Receipt, RotateCcw, Search, Wallet } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { EmptyNote, MonthlyBars, PersonLine, SimpleTable, StatTile, TestChip, dateText, inr } from "@/components/memberships/dashboard-parts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { MEMBERSHIP_FEE_PERCENT, type AdminMembershipReporterRow, type AdminMemberships } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { deskPersonHref } from "./nav";
import { MembershipRulesEditor } from "./membership-rules-editor";
import { SectionHeader } from "./section-header";

type Tab = "due" | "payments" | "payouts";

/**
 * Desk → Memberships (owner 2026-10-15): everything readers paid for reporters' memberships — WebNEWS's fee, what each
 * reporter has earned, what's been paid out and what's still due — and "Record payout" when money is sent.
 */
export function MembershipsView() {
  const query = useQuery({ queryKey: qk.adminMemberships, queryFn: ({ signal }) => api.admin.memberships(signal) });
  const [tab, setTab] = useState<Tab>("due");
  const [paying, setPaying] = useState<AdminMembershipReporterRow | null>(null);
  const [search, setSearch] = useState("");

  const data = query.data;
  const reporters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = data?.reporters ?? [];
    return needle ? list.filter((r) => `${r.reporter.name} ${r.reporter.username}`.toLowerCase().includes(needle)) : list;
  }, [data, search]);

  // Earnings by month across all reporters, from the payments list (last 6 months, IST).
  const monthly = useMemo(() => {
    const months: { month: string; netPaise: number; payments: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
      months.push({ month: d.toISOString().slice(0, 7), netPaise: 0, payments: 0 });
    }
    for (const p of data?.recent ?? []) {
      const m = months.find((x) => x.month === p.paidAt.slice(0, 7));
      if (m) {
        m.netPaise += p.feePaise;
        m.payments += 1;
      }
    }
    return months;
  }, [data]);

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Memberships"
        description={`What readers paid for reporters' memberships, WebNEWS's ${MEMBERSHIP_FEE_PERCENT}% fee, and what each reporter is owed. Record a payout when you send them money.`}
      />

      {/* Who may start one (owner 2026-10-16): the Desk's editable rules. */}
      <MembershipRulesEditor />

      {query.isPending ? (
        <div aria-hidden className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : query.isError || !data ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-muted">Couldn&rsquo;t load memberships. {errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {data.totals.testPayments > 0 && (
            <p className="flex items-start gap-2 rounded-2xl border border-[#f3d9a8] bg-[#fff8ea] px-4 py-3 text-sm text-[#7a4f00]">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {data.totals.testPayments} of {data.totals.payments} payments are development test payments (Razorpay isn&rsquo;t connected yet) — no real money
              moved for those.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile label="Collected from members" value={inr(data.totals.grossPaise)} hint={`${data.totals.payments} payments`} icon={<Receipt aria-hidden />} />
            <StatTile label={`WebNEWS fee (${MEMBERSHIP_FEE_PERCENT}%)`} value={inr(data.totals.feePaise)} hint="Platform revenue" tone="good" icon={<Wallet aria-hidden />} />
            <StatTile label="Active memberships" value={data.totals.activeMemberships} hint="Member × reporter pairs" icon={<Crown aria-hidden />} />
            <StatTile label="Earned by reporters" value={inr(data.totals.netPaise)} hint="After the fee" icon={<Banknote aria-hidden />} />
            <StatTile label="Paid out" value={inr(data.totals.paidOutPaise)} hint={`${data.payouts.length} payouts recorded`} icon={<Landmark aria-hidden />} />
            <StatTile label="Balance due to reporters" value={inr(data.totals.balancePaise)} hint="Still to pay" tone={data.totals.balancePaise > 0 ? "warn" : "plain"} icon={<Banknote aria-hidden />} />
          </div>

          <div className="card p-5">
            <MonthlyBars data={monthly} label="WebNEWS fee by month (last 6 months)" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Memberships" className="flex gap-1 rounded-xl bg-surface-2 p-1">
                {(
                  [
                    ["due", "Reporters & payouts due", data.reporters.length],
                    ["payments", "Payments", data.recent.length],
                    ["payouts", "Payout history", data.payouts.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                    className={cn("rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors", tab === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
                  >
                    {label} <span className="tabular-nums text-muted">{count}</span>
                  </button>
                ))}
              </div>
              {tab === "due" && (
                <label className="flex h-9 w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm sm:w-64">
                  <Search aria-hidden className="size-4 text-muted" />
                  <span className="sr-only">Find a reporter</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a reporter" className="min-w-0 flex-1 bg-transparent outline-none" />
                </label>
              )}
            </div>

            {tab === "due" &&
              (reporters.length === 0 ? (
                <EmptyNote>{search ? "No reporter matches." : "No reporter has membership earnings yet."}</EmptyNote>
              ) : (
                <SimpleTable head={["Reporter", "Price", "Members", "Collected", "Fee", "Earned", "Paid out", "Balance due", ""]}>
                  {reporters.map((r) => (
                    <tr key={r.reporter.id} className={cn(r.balancePaise > 0 && "bg-[#fffaf0]")}>
                      <td className="px-4 py-2.5">
                        <PersonLine person={r.reporter} size={30} href={r.reporter.username ? deskPersonHref(r.reporter.username) : null} />
                        {r.reporter.email && <span className="mt-0.5 block truncate pl-10 text-xs text-muted">{r.reporter.email}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{r.priceInr !== null ? `₹${r.priceInr}` : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        <span className="font-bold text-ink">{r.activeMembers}</span> <span className="text-muted">/ {r.totalMembers}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{inr(r.grossPaise)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{inr(r.feePaise)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{inr(r.netPaise)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{inr(r.paidOutPaise)}</td>
                      <td className={cn("whitespace-nowrap px-4 py-2.5 font-extrabold tabular-nums", r.balancePaise > 0 ? "text-[#9a6200]" : "text-muted")}>
                        {inr(r.balancePaise)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant={r.balancePaise > 0 ? "primary" : "outline"} onClick={() => setPaying(r)}>
                          Record payout
                        </Button>
                      </td>
                    </tr>
                  ))}
                </SimpleTable>
              ))}

            {tab === "payments" &&
              (data.recent.length === 0 ? (
                <EmptyNote>No payments yet.</EmptyNote>
              ) : (
                <SimpleTable head={["Date", "Member", "Reporter", "Paid", "WebNEWS fee", "To reporter", ""]}>
                  {data.recent.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(p.paidAt)}</td>
                      <td className="px-4 py-2.5">
                        <PersonLine person={p.member} size={26} href={p.member.username ? deskPersonHref(p.member.username) : null} />
                      </td>
                      <td className="px-4 py-2.5">
                        <PersonLine person={p.reporter} size={26} href={p.reporter.username ? deskPersonHref(p.reporter.username) : null} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(p.amountPaise)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-[#2f7a1f]">{inr(p.feePaise)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{inr(p.netPaise)}</td>
                      <td className="px-4 py-2.5">{p.provider === "test" && <TestChip />}</td>
                    </tr>
                  ))}
                </SimpleTable>
              ))}

            {tab === "payouts" &&
              (data.payouts.length === 0 ? (
                <EmptyNote>No payouts recorded yet. Use &ldquo;Record payout&rdquo; after you send a reporter their money.</EmptyNote>
              ) : (
                <SimpleTable head={["Paid on", "Reporter", "Amount", "Reference", "Note"]}>
                  {data.payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{dateText(p.paidAt)}</td>
                      <td className="px-4 py-2.5">
                        <PersonLine person={p.reporter} size={26} href={p.reporter.username ? deskPersonHref(p.reporter.username) : null} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(p.amountPaise)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.reference ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{p.note ?? "—"}</td>
                    </tr>
                  ))}
                </SimpleTable>
              ))}
          </div>
        </>
      )}

      <PayoutDialog row={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

/** "Record payout": the amount (the balance due, prefilled), the bank / UPI reference and a note. */
function PayoutDialog({ row, onClose }: { row: AdminMembershipReporterRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forId, setForId] = useState<string | null>(null);
  // A new reporter: start from their balance due.
  if (row && row.reporter.id !== forId) {
    setForId(row.reporter.id);
    setAmount(row.balancePaise > 0 ? String(row.balancePaise / 100) : "");
    setReference("");
    setNote("");
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      api.admin.recordPayout({ reporterId: row!.reporter.id, amountInr: Number(amount), reference: reference || null, note: note || null }),
    onSuccess: (next: AdminMemberships) => {
      queryClient.setQueryData(qk.adminMemberships, next);
      toast.success("Payout recorded", { description: `${inr(Math.round(Number(amount) * 100))} to ${row?.reporter.name}` });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount you paid");
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      open={row !== null}
      onOpenChange={(open) => !open && !save.isPending && onClose()}
      title="Record payout"
      description={row ? `Money sent to ${row.reporter.name} for their memberships. Balance due: ${inr(row.balancePaise)}.` : undefined}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="payout-form" loading={save.isPending}>
            Record payout
          </Button>
        </div>
      }
    >
      <form id="payout-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Amount paid (₹)" required error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} prefix={<span className="font-bold text-ink-2">₹</span>} />
        </Field>
        <Field label="Reference" hint="Bank / UPI transaction ID (optional)">
          <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI 4521 8890 1123" />
        </Field>
        <Field label="Note" hint="Optional">
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. October payout" />
        </Field>
      </form>
    </Modal>
  );
}
