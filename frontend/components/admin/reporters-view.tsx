"use client";

import { BadgeCheck, CircleSlash, Contact, Ellipsis, History, IdCard, LockKeyhole, UserRound } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState, type ReactNode } from "react";
import { handleText } from "@/components/brand/user-handle";
import { experienceLabel, formatMobile, reporterTypeLabel } from "@/components/presspass/press-format";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import {
  PRESS_ID_TYPE_LABELS,
  TRAINEE_APPROVALS_TO_VERIFY,
  ageOn,
  type AdminReporterRow,
  type AdminReportersQuery,
  type Page,
  formatIdNumber,
} from "@/lib/shared/contracts";
import { ActionDialog } from "./action-dialog";
import { ApprovalsMeter } from "./approvals-meter";
import { Chip, LevelChip } from "./chips";
import { DeskDate } from "./desk-date";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, SearchBox, Segmented } from "./list-parts";
import { deskPersonHref } from "./nav";
import { PersonCell } from "./person";
import { SectionHeader } from "./section-header";
import { TBody, THead, Table, Td, Th, Tr } from "./table";
import { filtersKey, useUrlFilters } from "./url-state";
import { useDeskAction } from "./use-desk-action";
import { patchLists, useDeskList } from "./use-desk-list";

export type ReporterFilters = { level?: NonNullable<AdminReportersQuery["level"]>; q?: string };
type ReporterAction = "verify" | "downgrade" | "revoke";

const LEVELS = [
  { value: "all", label: "All" },
  { value: "trainee", label: "Trainee" },
  { value: "verified", label: "Verified" },
  { value: "revoked", label: "Revoked" },
] as const;

const COPY: Record<ReporterAction, { title: string; description: string; confirm: string; icon: ReactNode; done: string }> = {
  verify: {
    title: "Verify this reporter?",
    description: "Verified reporters publish instantly (no Review Desk) and carry the Verified badge everywhere. A revoked Press Pass is reinstated.",
    confirm: "Verify reporter",
    icon: <BadgeCheck aria-hidden />,
    done: "Reporter verified",
  },
  downgrade: {
    title: "Move back to Trainee?",
    description: `Their next stories go through the Review Desk again, and the count to Verified restarts (${TRAINEE_APPROVALS_TO_VERIFY} approvals).`,
    confirm: "Move to Trainee",
    icon: <IdCard aria-hidden />,
    done: "Moved back to Trainee",
  },
  revoke: {
    title: "Revoke the Press Pass?",
    description: "They become a Reader again and can't publish. Their stories stay up unless you remove them. Only the Editor Desk can reinstate the pass.",
    confirm: "Revoke Press Pass",
    icon: <CircleSlash aria-hidden />,
    done: "Press Pass revoked",
  },
};

type ReportersViewProps = { initialFilters: ReporterFilters; initial: Page<AdminReporterRow> | null };

/** Press Pass holders: level, progress, verification details and region; verify · move to Trainee · revoke. */
export function ReportersView({ initialFilters, initial }: ReportersViewProps) {
  const [filters, setFilters] = useUrlFilters<ReporterFilters>(initialFilters);
  const [initialKey] = useState(() => filtersKey(initialFilters));
  const list = useDeskList({
    queryKey: qk.adminReporters(filters),
    fetchPage: (cursor, signal) => api.admin.reporters({ ...filters, cursor }, signal),
    initial: filtersKey(filters) === initialKey ? initial : null,
  });
  const [pending, setPending] = useState<{ action: ReporterAction; row: AdminReporterRow } | null>(null);
  /** The reporter whose personal details are open (owner 2026-10-07). */
  const [details, setDetails] = useState<AdminReporterRow | null>(null);

  const act = useDeskAction({
    run: ({ row, action, reason }: { row: AdminReporterRow; action: ReporterAction; reason: string }) =>
      api.admin.reporterAction(row.user.id, action, reason || undefined),
    optimistic: (client, { row, action }) =>
      patchLists<AdminReporterRow>(client, ["admin", "reporters"], (r) => r.user.id === row.user.id, (r) => ({
        ...r,
        pass: {
          ...r.pass,
          status: action === "revoke" ? "revoked" : "active",
          level: action === "verify" ? "verified" : action === "downgrade" ? "trainee" : r.pass.level,
          approvedCount: action === "downgrade" ? 0 : r.pass.approvedCount,
        },
      })),
    success: (result, { action }) => ({ title: COPY[action].done, description: `${handleText(result.reporter.user.username)} · ${result.reporter.pass.passNumber}` }),
    errorTitle: (vars) => `Couldn't ${vars.action === "verify" ? "verify" : vars.action === "downgrade" ? "move back" : "revoke"} the reporter`,
  });

  const menuFor = (row: AdminReporterRow): DropdownItem[] => {
    const revoked = row.pass.status === "revoked";
    const items: DropdownItem[] = [];
    if (revoked || row.pass.level === "trainee") {
      items.push({ label: revoked ? "Reinstate as Verified…" : "Verify now…", icon: <BadgeCheck aria-hidden />, onSelect: () => setPending({ action: "verify", row }) });
    }
    if (!revoked && row.pass.level === "verified") {
      items.push({ label: "Move back to Trainee…", icon: <IdCard aria-hidden />, onSelect: () => setPending({ action: "downgrade", row }) });
    }
    if (!revoked) {
      items.push({ label: "Revoke Press Pass…", icon: <CircleSlash aria-hidden />, danger: true, onSelect: () => setPending({ action: "revoke", row }) });
    }
    items.push(
      { type: "separator" },
      { label: "Personal details", icon: <Contact aria-hidden />, onSelect: () => setDetails(row) },
      { label: "Find in People", icon: <UserRound aria-hidden />, href: deskPersonHref(row.user.username) },
      { label: "History", icon: <History aria-hidden />, href: `/admin/audit?target=${row.user.id}` },
    );
    return items;
  };

  const items = list.items;
  const copy = pending ? COPY[pending.action] : null;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Reporters"
        description={`Everyone holding a Press Pass. Trainees go through the Review Desk until ${TRAINEE_APPROVALS_TO_VERIFY} stories are approved; Verified reporters publish instantly.`}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Press Pass level"
          options={LEVELS}
          value={filters.level ?? "all"}
          onChange={(level) => setFilters({ level: level === "all" ? undefined : level })}
        />
        <SearchBox label="Search reporters" placeholder="Name, username, pass number or mobile" value={filters.q ?? ""} onSearch={(q) => setFilters({ q })} />
      </div>
      <LiveCount>{list.isSuccess ? `${items.length}${list.hasNextPage ? "+" : ""} reporters` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading reporters" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="The reporter list didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty icon={<IdCard aria-hidden />} title="No reporters here" description="Readers become reporters by getting a Press Pass." />
      ) : (
        <Table caption="Reporters">
          <THead>
            <Th>Reporter</Th>
            <Th>Press Pass</Th>
            <Th>Level</Th>
            <Th className="max-xl:hidden">Verification · region</Th>
            <Th>Stories</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            <AnimatePresence initial={false}>
              {items.map((row, i) => {
                const revoked = row.pass.status === "revoked";
                const region = [row.pass.city, row.pass.district, row.pass.stateName].filter(Boolean).join(", ");
                const background = reporterTypeLabel(row.pass);
                const experience = experienceLabel(row.pass.experience);
                return (
                  <Tr key={row.user.id} index={i} className="relative">
                    <Td className="max-md:basis-full max-md:pr-10 md:w-full md:max-w-0">
                      <PersonCell
                        person={{ ...row.user, reporterLevel: revoked ? null : row.pass.level }}
                        detail={row.user.email}
                      />
                    </Td>
                    <Td>
                      <p className="font-mono text-xs font-semibold tracking-wide text-ink">{row.pass.passNumber}</p>
                      <p className="whitespace-nowrap text-xs text-muted">
                        Issued <DeskDate iso={row.pass.issuedAt} />
                      </p>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <LevelChip level={row.pass.level} revoked={revoked} />
                          {row.user.suspended && <Chip tone="solid">Suspended</Chip>}
                          {!row.pass.complete && !revoked && <Chip tone="muted">Incomplete</Chip>}
                        </span>
                        {!revoked && row.pass.level === "trainee" && <ApprovalsMeter approved={row.pass.approvedCount} />}
                      </div>
                    </Td>
                    <Td className="max-xl:hidden max-md:block max-md:basis-full">
                      <div className="flex max-w-64 flex-col items-start gap-0.5 text-xs">
                        {background ? <p className="font-bold text-ink">{background}</p> : <p className="text-muted">Not verified yet</p>}
                        {experience && <p className="text-muted">Experience: {experience}</p>}
                        {row.pass.mobile && (
                          <a href={`tel:${row.pass.mobile}`} className="font-semibold tabular-nums text-brand hover:underline">
                            {formatMobile(row.pass.mobile)}
                          </a>
                        )}
                        {region && <p className="mt-0.5 text-muted">{region}</p>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted tabular-nums">
                      <span className="font-bold text-ink">{row.published}</span> live
                      {row.inReview > 0 && (
                        <>
                          {" · "}
                          <span className="font-bold text-brand">{row.inReview}</span> in review
                        </>
                      )}
                    </Td>
                    <Td className="w-12 text-right max-md:absolute max-md:right-2 max-md:top-2">
                      <DropdownMenu
                        label={`Actions for ${handleText(row.user.username)}`}
                        trigger={<Ellipsis aria-hidden className="size-5" />}
                        triggerClassName="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint-2 hover:text-brand aria-expanded:bg-tint-2 aria-expanded:text-brand"
                        items={menuFor(row)}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </AnimatePresence>
          </TBody>
        </Table>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />

      <PersonalDetails row={details} onClose={() => setDetails(null)} />

      <ActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={copy?.title ?? ""}
        description={copy?.description}
        confirmLabel={copy?.confirm ?? "Confirm"}
        confirmIcon={copy?.icon}
        note={{ label: "Reason (kept in the audit log)", placeholder: "Optional", maxLength: 1000 }}
        onConfirm={async (reason) => {
          if (pending) await act.mutateAsync({ row: pending.row, action: pending.action, reason });
        }}
      >
        {pending && (
          <div className="rounded-xl border border-border bg-surface-2/60 p-3">
            <PersonCell person={{ ...pending.row.user, reporterLevel: pending.row.pass.level }} detail={pending.row.pass.passNumber} link={false} />
          </div>
        )}
      </ActionDialog>
    </div>
  );
}

/**
 * A reporter's personal details (owner 2026-10-07: kept for legal matters) — only the Editor Desk sees them. Passes
 * issued before they were asked show what's missing.
 */
function PersonalDetails({ row, onClose }: { row: AdminReporterRow | null; onClose: () => void }) {
  const pass = row?.pass;
  const age = pass?.dateOfBirth ? ageOn(pass.dateOfBirth) : null;
  const rows: Array<[string, ReactNode]> = pass
    ? [
        ["Full name", pass.legalName],
        ["Date of birth", pass.dateOfBirth ? `${formatDate(pass.dateOfBirth, "long")}${age !== null ? ` · ${age} years` : ""}` : null],
        ["Address", pass.address ? `${pass.address}${pass.pincode ? ` — ${pass.pincode}` : ""}` : null],
        ["Government ID", pass.idType ? PRESS_ID_TYPE_LABELS[pass.idType] : null],
        ["ID number", pass.idNumber ? <span className="font-mono tracking-wide">{formatIdNumber(pass.idType, pass.idNumber)}</span> : null],
        ["Mobile", pass.mobile ? formatMobile(pass.mobile) : null],
        ["Email", row.user.email],
      ]
    : [];
  return (
    <Modal
      open={row !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Personal details"
      description={row ? `${handleText(row.user.username)} · ${row.pass.passNumber}` : undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
        Private — kept for legal matters. Don&rsquo;t share them outside the Editor Desk.
      </p>
      <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5 text-sm">
            <dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
            <dd className="break-words text-ink">{value ?? <span className="italic text-faint">Not given yet</span>}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
