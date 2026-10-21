"use client";

import { ChevronRight, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { PressMeetSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { durationLabel, inr, inviteStage, meetDateParts, meetRange, meetStatusChip } from "./format";
import { Chip, PlatformChip, PublicChip } from "./parts";

/** The pink date tile: weekday and day in red, month and year under them (India time). */
export function DateTile({ iso, className }: { iso: string; className?: string }) {
  const { weekday, day, month, year } = meetDateParts(iso);
  return (
    <span aria-hidden className={cn("flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-tint py-2.5 text-center leading-none sm:w-20 sm:py-3", className)}>
      <span className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-brand sm:text-xs">{weekday}</span>
      <span className="mt-1 font-wide text-3xl font-black tabular-nums text-brand sm:text-4xl">{day}</span>
      <span className="mt-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide text-ink sm:text-xs">{month}</span>
      <span className="mt-0.5 text-[0.625rem] font-semibold tabular-nums text-muted sm:text-[0.6875rem]">{year}</span>
    </span>
  );
}

/**
 * One press meet in the /press-meet list (owner 2026-10-10, from their reference): the date tile, the status chips, the
 * title, time (IST) · length · platform, the agenda (wider screens), who's in — then "View Details" and ›. The whole row
 * opens the press meet.
 */
export function MeetRow({ meet }: { meet: PressMeetSummary }) {
  const status = meetStatusChip(meet);
  const stage = meet.myInvite ? inviteStage(meet.myInvite, meet, "reporter") : null;
  const organizer = meet.role === "organizer";
  return (
    <li>
      <Link
        href={`/press-meet/${meet.id}`}
        className={cn(
          "group flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card transition-[border-color,box-shadow] hover:border-tint-border hover:shadow-pop sm:gap-5 sm:p-4",
          meet.status === "live" && "border-brand ring-1 ring-brand",
        )}
      >
        <DateTile iso={meet.startsAt} />
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone={status.tone} className="h-5.5 px-2 text-[0.625rem]">
              {status.label}
            </Chip>
            {meet.visibility === "public" && <PublicChip />}
            {stage && stage.label !== status.label && (
              <Chip tone={stage.tone} className="h-5.5 px-2 text-[0.625rem]">
                {stage.label}
              </Chip>
            )}
          </span>
          <span className="line-clamp-1 text-[0.9375rem] font-extrabold leading-snug text-ink transition-colors group-hover:text-brand sm:text-lg">
            {meet.title}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted sm:gap-x-5 sm:text-[0.8125rem] [&_svg]:size-3.5">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden />
              {meetRange(meet.startsAt, meet.endsAt)} IST
              <span className="text-muted-2">({durationLabel(meet.durationMinutes)})</span>
            </span>
            <PlatformChip platform={meet.platform} />
          </span>
          {meet.agenda && <span className="line-clamp-1 hidden text-sm text-ink-2 sm:block">{meet.agenda}</span>}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted [&_svg]:size-3.5">
            {organizer ? (
              <span className="inline-flex items-center gap-1.5">
                <Users aria-hidden />
                {meet.visibility === "public"
                  ? `${meet.counts.accepted} joined`
                  : `${meet.counts.accepted} of ${meet.counts.total} accepted`}
              </span>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Avatar src={meet.organizer.image} name={meet.organizer.name} size={20} decorative />
                <span className="truncate">{meet.organizer.name}</span>
                {meet.visibility === "public"
                  ? meet.myInvite?.status === "accepted" && <strong className="font-bold text-success-strong">· You&rsquo;re attending</strong>
                  : meet.myInvite && <strong className="font-bold text-ink">· {inr(meet.myInvite.price)}</strong>}
              </span>
            )}
          </span>
        </span>
        <span className="hidden h-10 shrink-0 items-center rounded-xl border border-border-strong bg-surface px-3.5 text-[0.8125rem] font-bold text-ink transition-colors group-hover:border-ink min-[400px]:inline-flex sm:h-11 sm:px-6 sm:text-sm">
          View Details
        </span>
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors group-hover:bg-tint group-hover:text-brand sm:size-10">
          <ChevronRight className="size-4.5" />
        </span>
      </Link>
    </li>
  );
}
