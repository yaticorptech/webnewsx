"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Crown, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { BackButton } from "@/components/layout/back-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { dateText, useMembershipPay } from "./use-membership-pay";
import type { MembershipCheckout } from "@/lib/shared/contracts";

/*
 * Premium membership checkout (owner 2026-10-14): the reporter, what the month costs, then Razorpay Checkout. The 8%
 * platform fee comes out of the reporter's share and is not shown to buyers (owner: only the member charge and total).
 */

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function MembershipCheckoutView({ username, next }: { username: string; next: string | null }) {
  const router = useRouter();
  const checkout = useQuery({
    queryKey: ["membership-checkout", username],
    queryFn: ({ signal }) => api.memberships.checkout(username, signal),
  });

  const { pay, paying } = useMembershipPay(username, checkout.data?.reporter.image, () => {
    router.push(next ?? `/${username}`);
    router.refresh();
  });

  return (
    // Full width on computers (data-grid-page); our own back arrow, so the shell's is hidden (data-own-back).
    <div data-grid-page="" data-own-back="" className="w-full pb-10">
      <div className="mb-4 flex items-center gap-2 lg:mb-6">
        <BackButton fallback={next ?? `/${username}`} />
        <h1 className="font-wide text-xl font-extrabold text-ink">Checkout</h1>
      </div>

      {checkout.isPending ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      ) : checkout.isError ? (
        <p className="card px-5 py-8 text-center text-sm text-muted">{errorMessage(checkout.error)}</p>
      ) : (
        <Summary data={checkout.data} paying={paying} onPay={() => void pay()} />
      )}
    </div>
  );
}

function Summary({ data, paying, onPay }: { data: MembershipCheckout; paying: boolean; onPay: () => void }) {
  const { reporter } = data;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-8">
      {/* What you're buying */}
      <section aria-label="Membership" className="card overflow-hidden">
        <div className="flex items-center gap-4 bg-gradient-to-r from-amber-50 to-surface px-5 py-6 sm:px-8 lg:py-8">
          <Avatar src={reporter.image} name={reporter.name} size={72} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-wide text-xl font-extrabold text-ink">
              {reporter.name}
              {reporter.reporterLevel === "verified" && <VerifiedBadge size={18} />}
            </p>
            <p className="text-sm text-muted">@{reporter.username}</p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-[#3b2600]">
              <Crown aria-hidden className="size-3.5" /> Premium membership
            </p>
          </div>
        </div>
        <div className="px-5 py-6 sm:px-8">
          <h2 className="font-wide text-lg font-extrabold text-ink">What you get</h2>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink-2">
            {[
              `Read all of ${reporter.name}'s members-only stories`,
              `${data.days} days of access, starting today`,
              "Renew any time — paying again adds more days",
              "No auto-debit: we remind you before it ends so you can renew",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-strong" />
                {line}
              </li>
            ))}
          </ul>
          {data.activeUntil && (
            <p className="mt-5 rounded-xl bg-tint px-3.5 py-2.5 text-sm font-semibold text-ink">
              You&rsquo;re a member until {dateText(data.activeUntil)}. Paying again adds {data.days} more days.
            </p>
          )}
        </div>
      </section>

      {/* Order summary + pay (sticks beside the details on computers) */}
      <section aria-label="Order summary" className="card px-5 py-6 sm:px-6 lg:sticky lg:top-below-nav">
        <h2 className="font-wide text-lg font-extrabold text-ink">Order summary</h2>
        <dl className="mt-4 divide-y divide-border rounded-2xl border border-border text-sm">
          <Row label={`Premium member charge (${data.days} days)`} value={rupees(data.totalPaise)} />
          <div className="flex items-center justify-between bg-surface-2 px-4 py-3.5">
            <dt className="font-bold text-ink">Total you pay</dt>
            <dd className="font-wide text-lg font-black text-ink">{rupees(data.totalPaise)}</dd>
          </div>
        </dl>

        {data.provider === null ? (
          <p className="mt-5 rounded-xl border border-border px-4 py-3 text-center text-sm font-semibold text-ink-2">
            Online payments aren&rsquo;t connected yet. Please check back soon.
          </p>
        ) : (
          <>
            <Button size="lg" fullWidth className="mt-5" loading={paying} onClick={onPay} leftIcon={<ShieldCheck aria-hidden />}>
              {data.provider === "test" ? "Pay (test mode)" : `Pay ${rupees(data.totalPaise)} with Razorpay`}
            </Button>
            {data.provider === "test" && (
              <p className="mt-2 text-center text-xs text-muted">Test mode: Razorpay isn&rsquo;t connected, so no money moves.</p>
            )}
            {data.provider === "razorpay" && (
              <p className="mt-2 text-center text-xs text-muted">UPI, cards, net banking and wallets · secured by Razorpay</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-ink">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
