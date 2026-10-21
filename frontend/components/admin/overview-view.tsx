"use client";

import { ArrowRight, CircleCheck, Flag, IdCard, Inbox, Newspaper, Radio, Sparkles, Stamp, UsersRound, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import type { AdminOverview } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { AuditLine } from "./audit-entry";
import { ListError } from "./list-parts";
import { SectionHeader } from "./section-header";
import { useOverview } from "./use-overview";

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] as const } }),
};

/**
 * Editor Desk home (owner 2026-10-16: a professional dashboard — neutral cards, red only where the desk must act):
 * what's waiting, the platform's numbers, and the latest desk actions.
 */
export function OverviewView({ initial }: { initial: AdminOverview | null }) {
  const { data, error, refetch } = useOverview(initial);

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Overview" />
        <ListError message={error ? "The desk's numbers didn't load." : "Loading…"} onRetry={() => void refetch()} />
      </div>
    );
  }

  const { kpis, recent } = data;
  const waiting = kpis.reviewQueue + kpis.flaggedStories + kpis.spotlightRequests + kpis.newMessages;
  return (
    <div className="animate-fade-up flex flex-col gap-6">
      <SectionHeader
        title="Overview"
        description={waiting > 0 ? `${waiting} item${waiting === 1 ? "" : "s"} waiting for the desk.` : "Nothing waiting — you're all caught up."}
      />

      {/* What needs the desk: one row of cards, a red count only when something waits. */}
      <section aria-label="Needs the desk" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <QueueCard index={0} href="/admin/review" icon={Stamp} count={kpis.reviewQueue} label="Review queue" detail={`${kpis.trainees} trainee${kpis.trainees === 1 ? "" : "s"} filing`} />
        <QueueCard index={1} href="/admin/flags" icon={Flag} count={kpis.flaggedStories} label="Reported stories" detail={`${kpis.openFlags} open report${kpis.openFlags === 1 ? "" : "s"}`} />
        <QueueCard index={2} href="/admin/spotlight" icon={Sparkles} count={kpis.spotlightRequests} label="Spotlight requests" detail={`${kpis.activeSpotlights} running now`} />
        <QueueCard index={3} href="/admin/inbox" icon={Inbox} count={kpis.newMessages} label="Unanswered messages" detail="Contact us inbox" />
      </section>

      {/* The platform: plain numbers in one bordered strip. */}
      <section aria-label="Platform" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)] md:grid-cols-4">
        <Kpi index={0} icon={Newspaper} label="Stories today" value={kpis.storiesToday} sub={`${compact(kpis.published)} live in total`} href="/admin/stories?status=published" />
        <Kpi index={1} icon={Radio} label="Active readers" value={kpis.activeReaders} sub="Last 7 days" />
        <Kpi index={2} icon={IdCard} label="Active reporters" value={kpis.activeReporters} sub={`${compact(kpis.reporters)} with a Press Pass`} href="/admin/reporters" />
        <Kpi index={3} icon={UsersRound} label="People" value={kpis.users} sub={kpis.suspended ? `${kpis.suspended} suspended` : "None suspended"} href="/admin/people" alert={kpis.suspended > 0} />
      </section>

      <section aria-labelledby="desk-recent" className="rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id="desk-recent" className="text-sm font-semibold text-ink">
            Recent desk activity
          </h2>
          <Link href="/admin/audit" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            Audit log
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
        <div className="px-5">
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No desk actions yet.</p>
          ) : (
            <ol className="divide-y divide-border">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <AuditLine entry={entry} compact />
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

const compact = (n: number) => n.toLocaleString("en-IN");

type QueueCardProps = { index: number; href: string; icon: LucideIcon; count: number; label: string; detail: string };

/** One queue: its name, the count (red while something waits) and a quiet detail line; the whole card opens it. */
function QueueCard({ index, href, icon: Icon, count, label, detail }: QueueCardProps) {
  const busy = count > 0;
  return (
    <motion.div variants={rise} initial="hidden" animate="show" custom={index} className="min-w-0">
      <Link
        href={href}
        aria-label={`${label}: ${busy ? count : "none"}`}
        className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-muted">
            <Icon aria-hidden className="size-4 shrink-0 text-faint" />
            <span className="truncate">{label}</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
        </span>
        <span className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-semibold tabular-nums leading-none tracking-[-0.02em]", busy ? "text-brand" : "text-ink")}>
            <NumberTicker value={count} format="plain" countUp />
          </span>
          {!busy && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2f7a1f]">
              <CircleCheck aria-hidden className="size-3.5" />
              Clear
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted">{detail}</span>
      </Link>
    </motion.div>
  );
}

type KpiProps = { index: number; icon: LucideIcon; label: string; value: number; sub: ReactNode; href?: string; alert?: boolean };

/** One number in the platform strip. */
function Kpi({ index, icon: Icon, label, value, sub, href, alert }: KpiProps) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted">
        <Icon aria-hidden className="size-4 text-faint" />
        {label}
      </span>
      <span className="mt-2 block text-2xl font-semibold tabular-nums leading-none tracking-[-0.01em] text-ink">
        <NumberTicker value={value} countUp />
      </span>
      <span className={cn("mt-1.5 block truncate text-xs", alert ? "font-medium text-brand" : "text-muted")}>{sub}</span>
    </>
  );
  const className = "block h-full border-border p-4 sm:p-5 [&:not(:first-child)]:border-l max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t";
  return (
    <motion.div variants={rise} initial="hidden" animate="show" custom={index + 4} className={className}>
      {href ? (
        <Link href={href} className="-m-4 block p-4 transition-colors hover:bg-[#fafafa] sm:-m-5 sm:p-5">
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}
