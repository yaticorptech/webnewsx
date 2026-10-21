"use client";

import { ScrollText, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/hooks/use-mounted";
import { qk } from "@/lib/query-keys";
import type { AuditEntry, Page } from "@/lib/shared/contracts";
import { AuditLine, auditTargetLabel } from "./audit-entry";
import { AUDIT_GROUPS } from "./audit-groups";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, Segmented } from "./list-parts";
import { SectionHeader } from "./section-header";
import { filtersKey, useUrlFilters } from "./url-state";
import { useDeskList } from "./use-desk-list";

export type AuditFilters = { action?: string; target?: string };


const utcDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const localDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Groups entries by calendar day (UTC until mounted, then the viewer's timezone — no hydration mismatch). */
function byDay(entries: AuditEntry[], local: boolean): { day: string; entries: AuditEntry[] }[] {
  const format = local ? localDay : utcDay;
  const groups: { day: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const day = format.format(new Date(entry.createdAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

/** Audit log (SPEC §3.11): every Editor Desk action — who, what, when — newest first. */
export function AuditView({ initialFilters, initial }: { initialFilters: AuditFilters; initial: Page<AuditEntry> | null }) {
  const [filters, setFilters] = useUrlFilters<AuditFilters>(initialFilters);
  const [initialKey] = useState(() => filtersKey(initialFilters));
  const list = useDeskList({
    queryKey: qk.adminAudit(filters),
    fetchPage: (cursor, signal) => api.admin.audit({ ...filters, cursor }, signal),
    initial: filtersKey(filters) === initialKey ? initial : null,
  });
  const mounted = useMounted();
  const items = list.items;
  const targetEntry = filters.target ? items.find((e) => e.targetId === filters.target) : undefined;
  const targetLabel = filters.target ? (targetEntry ? auditTargetLabel(targetEntry, "one item") : "one item") : null;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Audit log"
        description="Every decision the Editor Desk makes is written here — who did what, to which story or account, and when. Entries can't be edited."
      />
      <div className="flex flex-col gap-3">
        <Segmented
          label="Kind of action"
          options={AUDIT_GROUPS}
          value={filters.action ?? "all"}
          onChange={(action) => setFilters({ action: action === "all" ? undefined : action })}
        />
        {filters.target && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex">
            <span className="inline-flex items-center gap-2 rounded-full bg-tint py-1 pl-3.5 pr-1 text-sm font-semibold text-brand-strong ring-1 ring-inset ring-tint-border">
              History of {targetLabel}
              <button
                type="button"
                onClick={() => setFilters({ target: undefined })}
                aria-label="Show every entry"
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-tint-3"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          </motion.div>
        )}
      </div>
      <LiveCount>{list.isSuccess ? `${items.length}${list.hasNextPage ? "+" : ""} entries` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading the audit log" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="The audit log didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty icon={<ScrollText aria-hidden />} title="Nothing recorded yet" description="Desk actions of this kind will appear here." />
      ) : (
        <div className="flex flex-col gap-6">
          {byDay(items, mounted).map((group) => (
            <section key={group.day} aria-label={group.day} className="flex flex-col gap-2">
              <h2 className="kicker sticky top-28 z-10 -mx-1 self-start rounded-full bg-surface/95 px-3 py-1.5 text-muted shadow-card ring-1 ring-border lg:top-4">
                {group.day}
              </h2>
              <ol className="card divide-y divide-border px-4 sm:px-5">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <AuditLine entry={entry} onTarget={(e) => setFilters({ target: e.targetId })} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} label="Load older entries" />
    </div>
  );
}
