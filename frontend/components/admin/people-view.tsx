"use client";

import { Ban, Ellipsis, History, ShieldCheck, Trash2, UserCheck, UserCog, UsersRound } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { handleText } from "@/components/brand/user-handle";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { ROLE_LABELS, ROLE_VALUES, type AdminUserRow, type Page, type Role } from "@/lib/shared/contracts";
import { ActionDialog } from "./action-dialog";
import { Chip, LevelChip, RoleChip } from "./chips";
import { DeskDate } from "./desk-date";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, SearchBox, Segmented, SelectFilter } from "./list-parts";
import { PersonCell } from "./person";
import { SectionHeader } from "./section-header";
import { TBody, THead, Table, Td, Th, Tr } from "./table";
import { filtersKey, useUrlFilters } from "./url-state";
import { useDeskAction } from "./use-desk-action";
import { patchLists, useDeskList } from "./use-desk-list";
import { useUndo } from "./use-story-actions";

export type PeopleFilters = { q?: string; role?: Role; status?: "active" | "suspended" };

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "reader", label: "Readers" },
  { value: "reporter", label: "Reporters" },
  { value: "admin", label: "Editor Desk" },
] as const;

const ROLE_EFFECT: Record<Role, string> = {
  reader: "They lose publishing rights: an active Press Pass is revoked (their stories stay up).",
  reporter: "They can publish: a Trainee Press Pass is issued (or their previous pass is reinstated).",
  admin:
    "Full Editor Desk access: moderation, roles, Spotlight and the audit log. Admins publish like Verified reporters. They're signed out everywhere and open the Desk by logging in with their email and password.",
};

const PEOPLE = ["admin", "users"] as const;

type Pending =
  | { kind: "role"; row: AdminUserRow; role: Role }
  | { kind: "suspend"; row: AdminUserRow }
  | { kind: "delete"; row: AdminUserRow };

/** Every account: role changes (Reader · Reporter · Editor Desk) and suspensions, with the reason on record. */
export function PeopleView({ initialFilters, initial }: { initialFilters: PeopleFilters; initial: Page<AdminUserRow> | null }) {
  const [filters, setFilters] = useUrlFilters<PeopleFilters>(initialFilters);
  const [initialKey] = useState(() => filtersKey(initialFilters));
  const list = useDeskList({
    queryKey: qk.adminUsers(filters),
    fetchPage: (cursor, signal) => api.admin.users({ ...filters, cursor }, signal),
    initial: filtersKey(filters) === initialKey ? initial : null,
  });
  const undo = useUndo();
  const [pending, setPending] = useState<Pending | null>(null);
  const patch = (client: Parameters<typeof patchLists>[0], id: string, update: (row: AdminUserRow) => AdminUserRow) =>
    patchLists<AdminUserRow>(client, PEOPLE, (row) => row.id === id, update);

  const setRole = useDeskAction({
    run: ({ row, role }: { row: AdminUserRow; role: Role }) => api.admin.setRole(row.id, role),
    optimistic: (client, { row, role }) => patch(client, row.id, (r) => ({ ...r, role })),
    success: (result) => ({
      title: `Now ${ROLE_LABELS[result.user.role] === "Editor Desk" ? "on the Editor Desk" : `a ${ROLE_LABELS[result.user.role]}`}`,
      description: result.user.username ? handleText(result.user.username) : result.user.email,
    }),
    errorTitle: "Couldn't change the role",
  });

  const suspend = useDeskAction({
    run: ({ row, reason }: { row: AdminUserRow; reason: string }) => api.admin.suspend(row.id, reason),
    optimistic: (client, { row, reason }) =>
      patch(client, row.id, (r) => ({ ...r, suspended: true, suspendReason: reason, suspendedAt: new Date().toISOString() })),
    success: (_r, { row }) => ({
      title: "Account suspended",
      description: `${row.username ? handleText(row.username) : row.email} is signed out everywhere and their stories are off the feeds.`,
      action: { label: "Undo", onClick: () => void undo(() => api.admin.unsuspend(row.id), "Suspension lifted") },
    }),
    errorTitle: "Couldn't suspend the account",
  });

  const unsuspend = useDeskAction({
    run: ({ row }: { row: AdminUserRow }) => api.admin.unsuspend(row.id),
    optimistic: (client, { row }) => patch(client, row.id, (r) => ({ ...r, suspended: false, suspendReason: null, suspendedAt: null })),
    success: (_r, { row }) => ({
      title: "Suspension lifted",
      description: `${row.username ? handleText(row.username) : row.email} can sign in again; their stories are back.`,
      action: {
        label: "Undo",
        onClick: () => void undo(() => api.admin.suspend(row.id, row.suspendReason || "Suspended by the Editor Desk"), "Account suspended again"),
      },
    }),
    errorTitle: "Couldn't lift the suspension",
  });

  // Delete account (owner 2026-10-01): for good — no undo; the row leaves the list right away.
  const deleteAccount = useDeskAction({
    run: ({ row }: { row: AdminUserRow }) => api.admin.deleteUser(row.id),
    optimistic: (client, { row }) => patchLists<AdminUserRow>(client, PEOPLE, (r) => r.id === row.id, () => null),
    success: (result, { row }) => ({
      title: "Account deleted",
      description: `${row.username ? handleText(row.username) : row.email} and everything they posted are gone${
        result.stories > 0 ? ` (${pluralize(result.stories, "story", "stories")})` : ""
      }.`,
    }),
    errorTitle: "Couldn't delete the account",
  });

  const menuFor = (row: AdminUserRow): DropdownItem[] => {
    const items: DropdownItem[] = [{ type: "label", label: "Change role" }];
    for (const role of ROLE_VALUES) {
      if (role === row.role) continue;
      items.push({
        label: `Make ${role === "admin" ? "Editor Desk" : ROLE_LABELS[role]}…`,
        icon: role === "admin" ? <ShieldCheck aria-hidden /> : <UserCog aria-hidden />,
        onSelect: () => setPending({ kind: "role", row, role }),
        disabled: !row.onboarded && role !== "reader",
      });
    }
    items.push({ type: "separator" });
    if (row.suspended) {
      items.push({ label: "Lift suspension", icon: <UserCheck aria-hidden />, onSelect: () => unsuspend.mutate({ row }) });
    } else {
      items.push({
        label: row.role === "admin" ? "Suspend (change role first)" : "Suspend…",
        icon: <Ban aria-hidden />,
        danger: true,
        disabled: row.role === "admin",
        onSelect: () => setPending({ kind: "suspend", row }),
      });
    }
    const deskAccount = row.role === "admin" || row.adminEmail;
    items.push({
      label: deskAccount ? "Delete account (change role first)" : "Delete account…",
      icon: <Trash2 aria-hidden />,
      danger: true,
      disabled: deskAccount,
      onSelect: () => setPending({ kind: "delete", row }),
    });
    items.push({ type: "separator" });
    items.push({ label: "History", icon: <History aria-hidden />, href: `/admin/audit?target=${row.id}` });
    return items;
  };

  const items = list.items;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="People"
        description="Every account on WebNEWS. Change roles, and suspend accounts that break the rules — suspended people are signed out, can't sign in, and their stories leave the feeds."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Segmented
          label="Role"
          options={ROLE_FILTERS}
          value={filters.role ?? "all"}
          onChange={(role) => setFilters({ role: role === "all" ? undefined : role })}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectFilter
            label="Status"
            value={filters.status ?? ""}
            onChange={(status) => setFilters({ status: (status || undefined) as PeopleFilters["status"] })}
            options={[
              { value: "", label: "Any status" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ]}
            className="sm:w-40"
          />
          <SearchBox label="Search people" placeholder="Name, username or email" value={filters.q ?? ""} onSearch={(q) => setFilters({ q })} />
        </div>
      </div>
      <LiveCount>{list.isSuccess ? `${items.length}${list.hasNextPage ? "+" : ""} people` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading people" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="The people list didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty icon={<UsersRound aria-hidden />} title="Nobody matches" description="Try another role, status or search." />
      ) : (
        <Table caption="People">
          <THead>
            <Th>Person</Th>
            <Th>Role</Th>
            <Th className="max-lg:hidden">Joined</Th>
            <Th className="max-xl:hidden">Reach</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            <AnimatePresence initial={false}>
              {items.map((row, i) => (
                <Tr key={row.id} index={i} className="relative">
                  <Td className="max-md:basis-full max-md:pr-10 md:w-full md:max-w-0">
                    <PersonCell person={row} detail={row.email} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <RoleChip role={row.role} />
                      {row.role === "reporter" && <LevelChip level={row.reporterLevel} />}
                      {row.adminEmail && (
                        <span title="Listed in ADMIN_EMAILS: promoted back to the Editor Desk on every email + password sign-in">
                          <Chip tone="muted">ADMIN_EMAILS</Chip>
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted max-lg:hidden max-md:block">
                    Joined <DeskDate iso={row.createdAt} />
                    {!row.onboarded && <span className="block font-semibold text-brand">Profile unfinished</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted tabular-nums max-xl:hidden max-md:block">
                    {pluralize(row.published, "story", "stories")} · {pluralize(row.followers, "follower")}
                  </Td>
                  <Td>
                    {row.suspended ? (
                      <div className="flex flex-col items-start gap-1">
                        <Chip tone="solid" icon={<Ban aria-hidden />}>
                          Suspended
                        </Chip>
                        {row.suspendReason && (
                          <p className="line-clamp-2 max-w-52 text-xs text-muted" title={row.suspendReason}>
                            {row.suspendReason}
                          </p>
                        )}
                        {row.suspendedAt && (
                          <p className="text-[0.6875rem] text-muted-2">
                            <TimeAgo date={row.suspendedAt} />
                          </p>
                        )}
                      </div>
                    ) : (
                      <Chip tone="live">Active</Chip>
                    )}
                  </Td>
                  <Td className="w-12 text-right max-md:absolute max-md:right-2 max-md:top-2">
                    {row.isSelf ? (
                      <span className="kicker inline-flex h-9 items-center px-2 text-muted">You</span>
                    ) : (
                      <DropdownMenu
                        label={`Actions for ${row.username ? handleText(row.username) : row.email}`}
                        trigger={<Ellipsis aria-hidden className="size-5" />}
                        triggerClassName="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint-2 hover:text-brand aria-expanded:bg-tint-2 aria-expanded:text-brand"
                        items={menuFor(row)}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </AnimatePresence>
          </TBody>
        </Table>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />

      <ActionDialog
        open={pending?.kind === "role"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === "role" ? `Make ${pending.role === "admin" ? "Editor Desk" : `a ${ROLE_LABELS[pending.role]}`}?` : ""}
        description={pending?.kind === "role" ? ROLE_EFFECT[pending.role] : undefined}
        confirmLabel="Change role"
        confirmIcon={<UserCog aria-hidden />}
        onConfirm={async () => {
          if (pending?.kind === "role") await setRole.mutateAsync({ row: pending.row, role: pending.role });
        }}
      >
        {pending?.kind === "role" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-surface-2/60 p-3">
              <PersonCell person={pending.row} detail={`${ROLE_LABELS[pending.row.role]} → ${ROLE_LABELS[pending.role]}`} link={false} />
            </div>
            {pending.row.adminEmail && pending.role !== "admin" && (
              <p className="rounded-lg bg-tint px-3 py-2 text-xs font-semibold text-brand-strong">
                This email is listed in ADMIN_EMAILS, so they&apos;ll be promoted back to the Editor Desk the next time they log in with
                their email and password.
              </p>
            )}
          </div>
        )}
      </ActionDialog>

      <ActionDialog
        open={pending?.kind === "suspend"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Suspend this account?"
        description="They're signed out everywhere, sign-in shows your reason, and all their stories leave the public feeds until you lift the suspension."
        confirmLabel="Suspend account"
        confirmIcon={<Ban aria-hidden />}
        note={{
          label: "Reason (shown to them at sign-in)",
          placeholder: "e.g. Repeated misinformation after warnings",
          required: true,
          requiredMessage: "Give a reason",
          maxLength: 500,
        }}
        onConfirm={async (reason) => {
          if (pending?.kind === "suspend") await suspend.mutateAsync({ row: pending.row, reason });
        }}
      >
        {pending?.kind === "suspend" && (
          <div className="rounded-xl border border-border bg-surface-2/60 p-3">
            <PersonCell person={pending.row} detail={pending.row.email} link={false} />
          </div>
        )}
      </ActionDialog>

      <ActionDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Delete this account for good?"
        description="Their account and everything in it are deleted permanently: all their stories (text, images and videos), comments, likes, messages, follows, Press Pass and notifications. This can't be undone."
        confirmLabel="Delete account"
        confirmIcon={<Trash2 aria-hidden />}
        typeToConfirm={
          pending?.kind === "delete"
            ? {
                phrase: pending.row.username ?? pending.row.email,
                label: (
                  <>
                    Type <strong className="font-bold text-ink">{pending.row.username ?? pending.row.email}</strong> to confirm
                  </>
                ),
              }
            : undefined
        }
        onConfirm={async () => {
          if (pending?.kind === "delete") await deleteAccount.mutateAsync({ row: pending.row });
        }}
      >
        {pending?.kind === "delete" && (
          <div className="rounded-xl border border-brand/40 bg-tint p-3">
            <PersonCell person={pending.row} detail={pending.row.email} link={false} />
          </div>
        )}
      </ActionDialog>
    </div>
  );
}
