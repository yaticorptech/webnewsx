"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ExternalLink, FileText, IndianRupee, Presentation } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { fileSize } from "@/components/press-meet/new/booking-extras";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { PLATFORM_FEE_MAX, PRESS_MEET_PLATFORM_LABELS, type AdminPlatformFee, type AdminPressMeetRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { DeskDate } from "./desk-date";
import { ListEmpty, ListError, ListLoading, LoadMore } from "./list-parts";
import { deskPersonHref } from "./nav";
import { SectionHeader, SubHeading } from "./section-header";
import { TBody, THead, Table, Td, Th, Tr } from "./table";

const rupees = (amount: number) => `₹${formatNumber(amount)}`;

type DeskPage = { items: AdminPressMeetRow[]; nextCursor: string | null };

/**
 * Desk → Press meets (owner 2026-10-05): the platform fee organizers pay to book a press meet (whole ₹; ₹0 = free —
 * the booking form shows the new amount at once), and every press meet with its organizer, reporters, the fee paid and
 * the press meet report to open.
 */
export function PressMeetsView({ initialFee, initialPage }: { initialFee: AdminPlatformFee; initialPage: DeskPage }) {
  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Press meets"
        description="Set the platform fee organizers pay to book a press meet, and see every press meet with its report. Payments aren't connected yet, so fees are test payments for now."
      />
      <PlatformFeeCard initial={initialFee} />
      <PressMeetList initialPage={initialPage} />
    </div>
  );
}

function PlatformFeeCard({ initial }: { initial: AdminPlatformFee }) {
  const id = useId();
  const queryClient = useQueryClient();
  const fee = useQuery({ queryKey: qk.adminPlatformFee, queryFn: ({ signal }) => api.admin.platformFee(signal), initialData: initial });
  const [value, setValue] = useState(String(initial.amountInr));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (amountInr: number) => api.admin.setPlatformFee(amountInr),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.adminPlatformFee, saved);
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetPlatformFee });
      void queryClient.invalidateQueries({ queryKey: qk.adminAll });
      setValue(String(saved.amountInr));
      toast.success(saved.amountInr === 0 ? "Booking is now free" : "Platform fee saved", {
        description: saved.amountInr === 0 ? "Organizers skip the payment step." : `${rupees(saved.amountInr)} per press meet.`,
      });
    },
    onError: (err) => toast.error("Couldn't save the platform fee", { description: errorMessage(err) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = value.replace(/[,\s₹]/g, "");
    const amount = Number(digits);
    if (digits === "" || !Number.isInteger(amount) || amount < 0) return setError("Enter the fee in whole rupees, e.g. 499 (0 = free)");
    if (amount > PLATFORM_FEE_MAX) return setError(`Keep it under ${rupees(PLATFORM_FEE_MAX)}`);
    setError(null);
    save.mutate(amount);
  };

  const current = fee.data.amountInr;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <SubHeading id={`${id}-title`} title="Platform fee" />
      <form onSubmit={submit} noValidate className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tint text-brand max-sm:hidden">
          <IndianRupee aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`${id}-amount`} className="kicker text-muted">
            Fee per press meet
          </label>
          <div
            className={cn(
              "flex h-11 max-w-60 items-center gap-1 rounded-xl border bg-surface px-3 text-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)]",
              error ? "border-brand" : "border-border-strong",
            )}
          >
            <span className="font-bold text-muted">₹</span>
            <input
              id={`${id}-amount`}
              value={value}
              inputMode="numeric"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : `${id}-hint`}
              onChange={(event) => {
                setValue(event.target.value.replace(/[^\d]/g, ""));
                if (error) setError(null);
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] font-semibold text-ink tabular-nums outline-none"
            />
          </div>
          {error ? (
            <p id={`${id}-error`} className="text-xs font-semibold text-brand">
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className="text-xs text-muted">
              Now {current === 0 ? "free" : rupees(current)}
              {fee.data.updatedAt && (
                <>
                  {" "}
                  · changed <TimeAgo date={fee.data.updatedAt} />
                </>
              )}
              . Organizers pay it in the last step of booking; 0 = free.
            </p>
          )}
        </div>
        <Button type="submit" loading={save.isPending} disabled={value === String(current)} className="sm:mb-6">
          Save fee
        </Button>
      </form>
    </section>
  );
}

function PressMeetList({ initialPage }: { initialPage: DeskPage }) {
  const id = useId();
  const list = useInfiniteQuery({
    queryKey: qk.adminPressMeets,
    queryFn: ({ pageParam, signal }) => api.admin.pressMeets(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialPage], pageParams: [null] },
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <SubHeading id={`${id}-title`} title="All press meets" />
      {list.isPending ? (
        <ListLoading label="Loading press meets" />
      ) : list.isError ? (
        <ListError message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty icon={<Presentation aria-hidden />} title="No press meets yet" description="Press meets show up here as soon as someone books one." />
      ) : (
        <>
          <Table caption="Press meets">
            <THead>
              <Th>Press meet</Th>
              <Th>Organizer</Th>
              <Th>Reporters</Th>
              <Th>Platform fee</Th>
              <Th className="text-right">Report</Th>
            </THead>
            <TBody>
              {items.map((meet, i) => (
                <Tr key={meet.id} index={i}>
                  <Td className="max-md:basis-full md:w-full md:max-w-0">
                    <p className="truncate text-sm font-bold text-ink">{meet.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      <DeskDate iso={meet.startsAt} style="date-time" /> · {PRESS_MEET_PLATFORM_LABELS[meet.platform]} ·{" "}
                      <span className="capitalize">{meet.status.replace("_", " ")}</span>
                    </p>
                  </Td>
                  <Td label="Organizer">
                    <Link href={deskPersonHref(meet.organizer.username)} className="block max-w-44 truncate text-sm font-semibold text-ink hover:text-brand">
                      {meet.organizer.name}
                    </Link>
                    <UserHandle username={meet.organizer.username} truncate className="block max-w-44 text-xs text-muted" />
                  </Td>
                  <Td label="Reporters" className="whitespace-nowrap text-sm">
                    <span className="font-semibold text-ink">{meet.reporters}</span>
                    <span className="text-muted"> · {rupees(meet.totalAmount)}</span>
                  </Td>
                  <Td label="Platform fee" className="whitespace-nowrap text-sm">
                    {meet.platformFee ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-success-strong">
                        <CircleCheck aria-hidden className="size-4" />
                        {rupees(meet.platformFee.amountInr)}
                        {meet.platformFee.provider === "test" && <span className="font-normal text-muted">test</span>}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td label="Report" className="text-right">
                    {meet.report ? (
                      <a
                        href={api.pressMeets.reportUrl(meet.id)}
                        target="_blank"
                        rel="noopener"
                        title={`${meet.report.fileName} · ${fileSize(meet.report.sizeBytes)}`}
                        className="inline-flex max-w-48 items-center gap-1.5 text-sm font-bold text-brand hover:underline"
                      >
                        <FileText aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{meet.report.fileName}</span>
                        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <LoadMore hasMore={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </>
      )}
    </section>
  );
}
