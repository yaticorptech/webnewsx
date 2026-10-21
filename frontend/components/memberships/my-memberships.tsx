"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Crown, Receipt, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { MEMBERSHIP_DAYS, type MyMembership } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { EmptyNote, PersonLine, SimpleTable, StatTile, StatusChip, TestChip, ValidityBar, dateText, inr } from "./dashboard-parts";

/**
 * Settings → My memberships (owner 2026-10-15): every reporter the reader is (or was) a member of — active or
 * expired, valid until when (with the days left), what they paid in all — with Renew and the payment history.
 */
export function MyMembershipsCard() {
  const query = useQuery({ queryKey: qk.myMemberships, queryFn: ({ signal }) => api.memberships.mine(signal) });

  if (query.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
        <p className="text-sm text-muted">Couldn&rsquo;t load your memberships. {errorMessage(query.error)}</p>
        <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const items = query.data.items;
  const active = items.filter((item) => item.active);
  const spent = items.reduce((sum, item) => sum + item.totalPaidPaise, 0);

  return (
    <section aria-labelledby="my-memberships" className="card flex flex-col gap-6 px-5 py-6 sm:px-8">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
          <Crown />
        </span>
        <div className="min-w-0">
          <h2 id="my-memberships" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
            My memberships
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Reporters whose members-only stories you can read. Each payment gives {MEMBERSHIP_DAYS} days; renewing adds {MEMBERSHIP_DAYS} more. We
            remind you before a membership ends.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Active memberships" value={active.length} tone={active.length > 0 ? "good" : "plain"} icon={<Crown aria-hidden />} />
        <StatTile label="Reporters joined" value={items.length} icon={<Receipt aria-hidden />} />
        <StatTile label="Total paid" value={inr(spent)} icon={<Wallet aria-hidden />} />
      </div>

      {items.length === 0 ? (
        <EmptyNote>
          You haven&rsquo;t joined any reporter yet. Look for <strong className="text-ink">Join membership</strong> on a reporter&rsquo;s profile to read their
          members-only stories.
        </EmptyNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.reporter.id}>
              <MembershipItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MembershipItem({ item }: { item: MyMembership }) {
  const [open, setOpen] = useState(false);
  const username = item.reporter.username;
  return (
    <article className={cn("rounded-2xl border p-4", item.active ? "border-tint-border bg-surface" : "border-border bg-surface-2/40")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <PersonLine person={item.reporter} level={item.reporter.reporterLevel} size={44} />
        </div>
        <StatusChip active={item.active} />
        {username && item.priceInr !== null && (
          <Button href={`/membership/${username}`} size="sm" variant={item.active ? "outline" : "primary"}>
            {item.active ? "Renew" : "Join again"}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0">
          <p className="mb-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide text-muted">Validity</p>
          <ValidityBar until={item.validUntil} days={MEMBERSHIP_DAYS} />
        </div>
        <Fact label="Member since" value={dateText(item.memberSince)} />
        <Fact label="Price" value={item.priceInr !== null ? `₹${item.priceInr} / ${MEMBERSHIP_DAYS} days` : "No longer offered"} />
        <Fact label="Total paid" value={inr(item.totalPaidPaise)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-hover"
      >
        {open ? "Hide" : "Show"} payment history ({item.payments.length})
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3">
          <SimpleTable head={["Paid on", "Amount", "Period", ""]}>
            {item.payments.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-4 py-2.5">{dateText(p.paidAt)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{inr(p.amountPaise)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                  {p.periodStart && p.periodEnd ? `${dateText(p.periodStart)} – ${dateText(p.periodEnd)}` : "—"}
                </td>
                <td className="px-4 py-2.5">{p.provider === "test" && <TestChip />}</td>
              </tr>
            ))}
          </SimpleTable>
        </div>
      )}
      {username && (
        <Link href={`/${username}?tab=members`} className="mt-2 block text-xs font-semibold text-muted hover:text-ink">
          Read their members-only stories →
        </Link>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
