"use client";

import { Check, Sparkles, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { qk } from "@/lib/query-keys";
import { SPOTLIGHT_RANKING, type AdminOrdersStatus, type AdminSpotlightOrder, type Page, type SpotlightPackage } from "@/lib/shared/contracts";
import { ActionDialog } from "./action-dialog";
import { SpotlightStatusChip } from "./chips";
import { DeskDate } from "./desk-date";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, Segmented } from "./list-parts";
import { deskPersonHref, deskStoryHref } from "./nav";
import { showsBadge } from "./person";
import { SectionHeader } from "./section-header";
import { SpotlightPackages } from "./spotlight-packages";
import { StoryThumb } from "./story-thumb";
import { TBody, THead, Table, Td, Th, Tr } from "./table";
import { useDeskAction } from "./use-desk-action";
import { patchLists, useDeskList } from "./use-desk-list";

const TABS = [
  { value: "pending", label: "Requests" },
  { value: "active", label: "Running" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: AdminOrdersStatus; label: string }[];

export const rupees = (amount: number) => `₹${formatNumber(amount)}`;

type SpotlightViewProps = { initialOrders: Page<AdminSpotlightOrder> | null; initialPackages: SpotlightPackage[] | null };

/** Spotlight (SPEC §3.11): payments aren't connected, so the desk grants (comped / paid by hand) or declines each request. */
export function SpotlightView({ initialOrders, initialPackages }: SpotlightViewProps) {
  const [status, setStatus] = useState<AdminOrdersStatus>("pending");
  const list = useDeskList({
    queryKey: qk.adminSpotlightOrders(status),
    fetchPage: (cursor, signal) => api.admin.spotlightOrders(status, cursor, signal),
    initial: status === "pending" ? initialOrders : null,
  });
  const [pending, setPending] = useState<{ kind: "grant" | "decline"; order: AdminSpotlightOrder } | null>(null);

  const decide = useDeskAction({
    run: ({ order, kind, note }: { order: AdminSpotlightOrder; kind: "grant" | "decline"; note: string }) =>
      kind === "grant" ? api.admin.grantSpotlight(order.id, note || undefined) : api.admin.declineSpotlight(order.id, note || undefined),
    optimistic: (client, { order }) =>
      patchLists<AdminSpotlightOrder>(client, qk.adminSpotlightOrders("pending"), (o) => o.id === order.id, () => null),
    success: (result, { kind }) =>
      kind === "grant"
        ? {
            title: "Spotlight granted",
            description: `“${result.order.article.title ?? "Untitled story"}” is boosted for ${result.order.hours}h.`,
            action: { label: "See running", onClick: () => setStatus("active") },
          }
        : { title: "Request declined", description: "The reporter sees your note in their Newsroom." },
    errorTitle: (vars) => (vars.kind === "grant" ? "Couldn't grant the Spotlight" : "Couldn't decline the request"),
  });

  const items = list.items;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Spotlight"
        description={`Paid boosts. Payments aren't connected yet, so every request waits here: grant it (comped or paid by hand) and the story gets a ×${SPOTLIGHT_RANKING.multiplier} boost in For You with a clear Spotlight label — or decline it.`}
      />

      <section aria-label="Spotlight requests" className="flex flex-col gap-4">
        <Segmented label="Spotlight orders" options={TABS} value={status} onChange={setStatus} />
        <LiveCount>{list.isSuccess ? `${items.length} orders` : ""}</LiveCount>

        {list.isPending ? (
          <ListLoading label="Loading Spotlight orders" />
        ) : list.isError && items.length === 0 ? (
          <ListError message="The Spotlight orders didn't load." onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <ListEmpty
            icon={<Sparkles aria-hidden />}
            title={status === "pending" ? "No requests waiting" : status === "active" ? "Nothing in the Spotlight right now" : "No orders yet"}
            description={status === "pending" ? "Reporters request a Spotlight from their Newsroom; requests land here." : undefined}
          />
        ) : (
          <Table caption="Spotlight orders">
            <THead>
              <Th>Story</Th>
              <Th>Package</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </THead>
            <TBody>
              <AnimatePresence initial={false}>
                {items.map((order, i) => (
                  <Tr key={order.id} index={i}>
                    <Td className="max-md:basis-full md:w-full md:max-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <StoryThumb src={order.article.coverUrl} className="w-20" />
                        <div className="min-w-0">
                          {order.article.slug ? (
                            <Link href={deskStoryHref(order.article.title)} className="line-clamp-2 font-bold leading-snug text-ink hover:text-brand">
                              {order.article.title || "Untitled story"}
                            </Link>
                          ) : (
                            <p className="line-clamp-2 font-bold leading-snug text-ink">{order.article.title || "Untitled story"}</p>
                          )}
                          <p className="mt-0.5 truncate text-xs text-muted">
                            by{" "}
                            <Link href={deskPersonHref(order.reporter.username)} className="font-semibold text-ink-2 hover:text-brand">
                              <UserHandle username={order.reporter.username} />
                            </Link>
                            {showsBadge(order.reporter) && <VerifiedBadge size={13} className="ml-1" />} · requested <TimeAgo date={order.createdAt} />
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <p className="whitespace-nowrap text-sm font-bold text-ink">{order.packageName}</p>
                      <p className="whitespace-nowrap text-xs text-muted tabular-nums">
                        {order.hours}h · {rupees(order.priceInr)}
                      </p>
                    </Td>
                    <Td className="max-md:basis-full">
                      <OrderStatus order={order} />
                    </Td>
                    <Td className="text-right max-md:basis-full">
                      {order.status === "pending" ? (
                        <div className="flex justify-end gap-2 max-md:justify-stretch max-md:*:flex-1">
                          <Button variant="outline" size="sm" leftIcon={<X aria-hidden />} onClick={() => setPending({ kind: "decline", order })}>
                            Decline
                          </Button>
                          <Button size="sm" leftIcon={<Check aria-hidden />} onClick={() => setPending({ kind: "grant", order })}>
                            Grant
                          </Button>
                        </div>
                      ) : order.grantedBy ? (
                        <p className="text-xs text-muted">by {order.grantedBy.username ? <UserHandle username={order.grantedBy.username} /> : order.grantedBy.name}</p>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </AnimatePresence>
            </TBody>
          </Table>
        )}
        <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </section>

      <SpotlightPackages initial={initialPackages} />

      <ActionDialog
        open={pending?.kind === "grant"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Grant this Spotlight?"
        description={
          pending
            ? `It starts now and runs for ${pending.order.hours} hours. Mark it paid or comped in the note — payments aren't connected yet.`
            : undefined
        }
        confirmLabel="Grant Spotlight"
        confirmIcon={<Sparkles aria-hidden />}
        note={{ label: "Note", placeholder: "Optional — e.g. Paid by UPI, ref …  /  Comped for launch week", maxLength: 1000 }}
        onConfirm={async (note) => {
          if (pending) await decide.mutateAsync({ order: pending.order, kind: "grant", note });
        }}
      >
        {pending && <OrderSummary order={pending.order} />}
      </ActionDialog>

      <ActionDialog
        open={pending?.kind === "decline"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Decline this request?"
        description="Nothing is charged. The reporter sees your note in their Newsroom and can request again later."
        confirmLabel="Decline request"
        confirmIcon={<X aria-hidden />}
        note={{ label: "Note to the reporter", placeholder: "Optional — why it wasn't a fit", maxLength: 1000 }}
        onConfirm={async (note) => {
          if (pending) await decide.mutateAsync({ order: pending.order, kind: "decline", note });
        }}
      >
        {pending && <OrderSummary order={pending.order} />}
      </ActionDialog>
    </div>
  );
}

function OrderSummary({ order }: { order: AdminSpotlightOrder }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
      <StoryThumb src={order.article.coverUrl} className="w-20" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{order.article.title || "Untitled story"}</p>
        <p className="mt-1 text-xs text-muted tabular-nums">
          <UserHandle username={order.reporter.username} /> · {order.packageName} · {order.hours}h · {rupees(order.priceInr)}
        </p>
      </div>
    </div>
  );
}

/** Status chip; a running boost also shows how much of it is left. */
function OrderStatus({ order }: { order: AdminSpotlightOrder }) {
  const now = useNow();
  const start = order.startsAt ? Date.parse(order.startsAt) : NaN;
  const end = order.endsAt ? Date.parse(order.endsAt) : NaN;
  const running = order.active && now !== null && Number.isFinite(start) && Number.isFinite(end) && end > start;
  const progress = running ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0;
  const hoursLeft = running ? Math.max(0, (end - now) / 3_600_000) : 0;

  return (
    <div className="flex min-w-36 flex-col items-start gap-1.5">
      <SpotlightStatusChip status={order.status} active={order.active} />
      {running ? (
        <>
          <span aria-hidden className="block h-1 w-full max-w-40 overflow-hidden rounded-full bg-tint-3">
            <span className="block h-full origin-left rounded-full bg-brand" style={{ transform: `scaleX(${1 - progress})` }} />
          </span>
          <span className="text-xs text-muted">
            {hoursLeft >= 1 ? `${Math.floor(hoursLeft)}h` : `${Math.max(1, Math.round(hoursLeft * 60))}m`} left
          </span>
        </>
      ) : order.endsAt && order.status !== "pending" ? (
        <span className="text-xs text-muted">
          Ran until <DeskDate iso={order.endsAt} style="date-time" />
        </span>
      ) : order.decidedAt ? (
        <span className="text-xs text-muted">
          Decided <TimeAgo date={order.decidedAt} />
        </span>
      ) : null}
      {order.note && <span className="line-clamp-2 max-w-56 text-xs italic text-muted">“{order.note}”</span>}
    </div>
  );
}
