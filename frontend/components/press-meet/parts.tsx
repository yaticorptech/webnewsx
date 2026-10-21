"use client";

import { ArrowRight, Clock3, Globe, IndianRupee, MonitorPlay, Users, Video } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { BackButton } from "@/components/layout/back-button";
import { Avatar } from "@/components/ui/avatar";
import type { PressMeetPlatform, PressMeetSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { durationLabel, inr, inviteStage, meetDay, meetRange, meetStatusChip, TONE_CLASSES, type Tone } from "./format";

/** Small pill: "Live now", "Upcoming", "Review story"… */
export function Chip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-bold uppercase tracking-wider whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {tone === "live" && (
        <span aria-hidden className="relative flex size-1.5 shrink-0">
          <span className="absolute inset-0 animate-heartbeat-ring rounded-full bg-white" />
          <span className="relative size-1.5 rounded-full bg-white" />
        </span>
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function PlatformChip({ platform }: { platform: PressMeetPlatform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted [&_svg]:size-3.5">
      {platform === "google_meet" ? <Video aria-hidden /> : <MonitorPlay aria-hidden className="text-brand" />}
      {platform === "google_meet" ? "Google Meet" : "WebNEWS Live"}
    </span>
  );
}

/** The slanted red date block: weekday, day number, month (IST). */
export function DateBlock({ iso, muted = false, className }: { iso: string; muted?: boolean; className?: string }) {
  const [weekday, day, month] = meetDay(iso).replace(",", "").split(" ");
  return (
    <span
      aria-hidden
      className={cn(
        "flex w-15 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center leading-none slice-tr [--slice:0.75rem]",
        muted ? "bg-surface-2 text-muted" : "bg-brand text-brand-contrast",
        className,
      )}
    >
      <span className="text-[0.625rem] font-bold uppercase tracking-widest opacity-85">{weekday}</span>
      <span className="mt-1 font-wide text-2xl font-black tabular-nums">{day}</span>
      <span className="mt-1 text-[0.625rem] font-bold uppercase tracking-widest opacity-85">{month}</span>
    </span>
  );
}

/**
 * Page heading in the house style (kicker with speed lines, wide black title, muted line). The back arrow shares the
 * kicker's line (owner 2026-10-02, like Communities); data-own-back hides the shell's own arrow (globals.css).
 */
export function PageHeading({
  kicker,
  title,
  description,
  action,
  backFallback = "/",
}: {
  kicker: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Where the back arrow goes when there's no previous page on this site. */
  backFallback?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div data-own-back="" className="flex items-center gap-3">
          <BackButton fallback={backFallback} />
          <p className="kicker flex items-center gap-2 text-brand">
            <SpeedLines />
            {kicker}
          </p>
        </div>
        <h1 className="mt-3 font-wide text-[1.875rem] leading-[1.04] font-black tracking-tight text-ink sm:text-[2.375rem]">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </header>
  );
}

/** One press meet in a list (the organizer's page, the reporter's profile tab). */
export function MeetCard({ meet }: { meet: PressMeetSummary }) {
  const status = meetStatusChip(meet);
  const over = meet.status === "ended" || meet.status === "cancelled";
  const stage = meet.myInvite ? inviteStage(meet.myInvite, meet, "reporter") : null;
  return (
    <li>
      <Link
        href={`/press-meet/${meet.id}`}
        className={cn(
          "group card relative flex gap-4 p-4 transition-[border-color,box-shadow] hover:border-tint-border hover:shadow-pop sm:p-5",
          meet.status === "live" && "border-brand ring-1 ring-brand",
        )}
      >
        <DateBlock iso={meet.startsAt} muted={over} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone={status.tone}>{status.label}</Chip>
            {meet.visibility === "public" && <PublicChip />}
            {stage && stage.label !== status.label && <Chip tone={stage.tone}>{stage.label}</Chip>}
          </span>
          <span className="line-clamp-2 font-wide text-[1.0625rem] leading-snug font-extrabold text-ink group-hover:text-brand">{meet.title}</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted [&_svg]:size-3.5">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden />
              {meetRange(meet.startsAt, meet.endsAt)} IST · {durationLabel(meet.durationMinutes)}
            </span>
            <PlatformChip platform={meet.platform} />
            {meet.role === "organizer" ? (
              meet.visibility === "public" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users aria-hidden />
                  {meet.counts.accepted} joined
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Users aria-hidden />
                    {meet.counts.accepted} of {meet.counts.total} accepted
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink">
                    <IndianRupee aria-hidden />
                    {meet.totalAmount.toLocaleString("en-IN")}
                  </span>
                </>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Avatar src={meet.organizer.image} name={meet.organizer.name} size={18} decorative />
                {meet.organizer.name}
                {meet.visibility === "public" ? (
                  meet.myInvite?.status === "accepted" && <strong className="font-bold text-success-strong">· You&rsquo;re attending</strong>
                ) : (
                  meet.myInvite && <strong className="font-bold text-ink">· {inr(meet.myInvite.price)}</strong>
                )}
              </span>
            )}
          </span>
        </span>
        <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </Link>
    </li>
  );
}

/** "Public" — any reporter can join (owner 2026-10-07). */
export function PublicChip() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-success-soft px-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-success-strong [&_svg]:size-3">
      <Globe aria-hidden />
      Public
    </span>
  );
}

/** Live & upcoming first, then the rest, each under its own small heading. */
export function MeetSections({
  items,
  empty,
  renderItem = (meet) => <MeetCard key={meet.id} meet={meet} />,
}: {
  items: PressMeetSummary[];
  empty: ReactNode;
  /** How each press meet is drawn (the profile tab: MeetRow, owner 2026-10-10). */
  renderItem?: (meet: PressMeetSummary) => ReactNode;
}) {
  if (items.length === 0) return <>{empty}</>;
  // In the order they happen, the earliest first (owner 2026-10-05), in both groups.
  const byTime = (a: PressMeetSummary, b: PressMeetSummary) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const current = items.filter((m) => m.status === "live" || m.status === "scheduled").sort(byTime);
  const past = items.filter((m) => m.status !== "live" && m.status !== "scheduled").sort(byTime);
  return (
    <div className="flex flex-col gap-8">
      {current.length > 0 && (
        <section aria-labelledby="pm-upcoming" className="flex flex-col gap-3">
          <h2 id="pm-upcoming" className="kicker text-muted">
            Live &amp; upcoming
          </h2>
          <ul className="flex flex-col gap-3">
            {current.map(renderItem)}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="pm-past" className="flex flex-col gap-3">
          <h2 id="pm-past" className="kicker text-muted">
            Past
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map(renderItem)}
          </ul>
        </section>
      )}
    </div>
  );
}

export function MeetListSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card flex gap-4 p-4 sm:p-5">
          <span className="h-19 w-15 animate-pulse rounded-xl bg-skeleton" />
          <span className="flex flex-1 flex-col gap-2.5 pt-1">
            <span className="h-5 w-24 animate-pulse rounded-full bg-skeleton" />
            <span className="h-5 w-3/4 animate-pulse rounded bg-skeleton" />
            <span className="h-4 w-1/2 animate-pulse rounded bg-skeleton" />
          </span>
        </li>
      ))}
    </ul>
  );
}
