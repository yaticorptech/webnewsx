"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarX2,
  Check,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  FileText,
  Hourglass,
  Info,
  Lock,
  MonitorPlay,
  PenLine,
  Radio,
  Tag,
  Users,
  Video,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { UserHandle } from "@/components/brand/user-handle";
import { BackButton } from "@/components/layout/back-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api, errorMessage, isApiError } from "@/lib/api";
import { useNow } from "@/lib/hooks/use-now";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetDetail } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { durationLabel, inr, meetDay, meetDayLong, meetRange, meetStatusChip, TONE_CLASSES } from "../format";
import { fileSize } from "../new/booking-extras";
import { Notepad } from "../notepad";
import { Chip } from "../parts";
import { usePressMeetLive } from "../use-press-meet-live";
import { OrganizerPanel, OrganizerStart } from "./organizer-panel";
import { LeaveLink, ReporterPanel, ReporterRecordings } from "./reporter-panel";

/**
 * /press-meet/[id] (owner 2026-10-01), after the owner's mockup (2026-10-08): a hero card — the red date block, the
 * status and platform chips, the title, date · time · duration, "You're attending" and the countdown, the reminder
 * line — on a red-to-newsroom-photo backdrop; beside it the Event details card (no Add to calendar — owner
 * 2026-10-08, it put an event in their calendar they didn't want); under the hero
 * the report and the organizer side by side, then the organizer's or reporter's own panel; the notes across the
 * whole width; recordings last. Live: every change refetches through `meet.changed`. Full screen width (owner
 * 2026-10-05, `data-grid-page`).
 */
export function PressMeetDetailView({ id }: { id: string }) {
  usePressMeetLive();
  const detail = useQuery({ queryKey: qk.pressMeet(id), queryFn: ({ signal }) => api.pressMeets.detail(id, signal) });

  if (detail.isPending) return <DetailSkeleton />;
  if (detail.isError) {
    const missing = isApiError(detail.error) && detail.error.status === 404;
    return (
      <EmptyState
        icon={<CalendarX2 aria-hidden />}
        kicker="Press meet"
        title={missing ? "Press meet not found" : "Couldn't load this press meet"}
        description={missing ? "It may have been removed, or it isn't one you organize or were invited to." : errorMessage(detail.error)}
        action={<Button href="/press-meet">Your press meets</Button>}
      />
    );
  }
  const meet = detail.data;
  return (
    <div data-grid-page="" className="flex flex-col gap-5">
      <TopBar />
      {/* grid-cols-1 = minmax(0, 1fr): on phones a long file name truncates instead of widening every card past the
          screen (owner 2026-10-09: "not aligned"). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Hero meet={meet} />
          {/* The report (when there is one) and the organizer side by side; the organizer alone takes the whole row. The
              organizer's Start / Cancel card sits under the organizer card (owner 2026-10-12). */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:[&>*:only-child]:col-span-2">
            {meet.report && <ReportCard meet={meet} report={meet.report} />}
            <div className="flex min-w-0 flex-col gap-5">
              <OrganizedBy meet={meet} />
              {meet.role === "organizer" && <OrganizerStart meet={meet} />}
            </div>
          </div>
          {meet.role === "organizer" ? <OrganizerPanel meet={meet} /> : <ReporterPanel meet={meet} />}
        </div>
        <EventDetails meet={meet} className="lg:self-start" />
      </div>
      {meet.status !== "cancelled" && <NotesCard meet={meet} />}
      {/* Organizer and reporters alike (owner 2026-10-05): each one's recording, from their own device. */}
      <ReporterRecordings meet={meet} />
    </div>
  );
}

/** A white button with a red edge and red text (the mockup's "View report" / "View profile"). */
const RED_OUTLINE = "border border-brand/45 bg-surface text-brand-strong ring-0 hover:border-brand hover:bg-tint";

/** Card heading: a red icon and small capitals ("EVENT DETAILS", "PRESS MEET REPORT"…). */
function CardTitle({ id, icon: Icon, children }: { id: string; icon: ComponentType<SVGProps<SVGSVGElement>>; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink">
      <Icon aria-hidden className="size-4.5 shrink-0 text-brand" />
      {children}
    </h2>
  );
}

/**
 * The page's own bar across the top (owner 2026-10-05 layout): back arrow + PRESS MEET — nothing else (owner
 * 2026-10-09: no bell, account menu or logo; the site's navbar has them). The back arrow is the page's
 * (data-own-back hides the shell's); the Android app shows none (data-app-no-back).
 */
function TopBar() {
  return (
    <div className="-mx-4 -mt-3 flex items-center justify-between gap-3 border-b border-tint-border bg-tint px-4 py-2.5 sm:-mx-6 sm:px-6 sm:py-3.5 md:-mt-4 lg:-mx-8 lg:px-8 2xl:-mx-10 2xl:px-10">
      <div data-own-back="" className="flex min-w-0 items-center gap-2.5">
        <span data-app-no-back="" className="contents">
          <BackButton fallback="/press-meet" plain />
        </span>
        <p className="kicker text-brand sm:text-base sm:tracking-[0.18em]">Press meet</p>
      </div>
    </div>
  );
}

/**
 * The hero, to the owner's crop of the mockup (2026-10-08, "same to same"), then white across the first 60% with
 * black text (owner 2026-10-09): the date block on its own red gradient, the blurred press-conference photo at
 * the right (public/brand/press-meet-hero.jpg — cut from the mockup); the UPCOMING chip square-cornered, the
 * platform beside it, the title, date · time · duration with red icons, then "You're attending" and the countdown
 * pills, and the reminder line. "Can't make it? Leave" is in the Event details card (the crop has no link here).
 */
function Hero({ meet }: { meet: PressMeetDetail }) {
  const status = meetStatusChip(meet);
  const over = meet.status === "ended" || meet.status === "cancelled";
  const attending = meet.role === "reporter" && meet.myInvite?.status === "accepted" && !over;
  const statusChip =
    status.tone === "live" ? (
      <Chip tone="live">{status.label}</Chip>
    ) : (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[0.6875rem] font-bold uppercase tracking-wide whitespace-nowrap",
        // Upcoming: the mockup's red with white text; over / cancelled keep their grey.
        status.tone === "brand" ? "bg-[#d10101] text-white" : TONE_CLASSES[status.tone],
      )}
    >
      <CalendarDays aria-hidden className="size-3 shrink-0" />
      {status.label}
    </span>
  );
  return (
    <section aria-labelledby="pm-title" className="card relative isolate overflow-hidden border-transparent bg-surface shadow-[0_10px_30px_-18px_rgb(16_24_40/0.35)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 max-sm:hidden">
        {/* White across the first 60% with black text (owner 2026-10-09; before: the mockup's red-to-pink); the photo
            and its fade keep the right. */}
        {/* From 640px: the photo at the right, fading in from the white. */}
        <img
          src="/brand/press-meet-hero.jpg"
          alt=""
          width={964}
          height={385}
          decoding="async"
          className="absolute inset-y-0 right-0 h-full w-auto max-w-[62%] object-cover object-right [mask-image:linear-gradient(to_right,transparent,#000_28%)]"
        />
      </div>

      {/* Phones (owner 2026-10-12, to their reference): the photo as a rounded banner with the status chip and the date
          block on it, then the details under it in the same card. */}
      <div className="relative mx-2.5 mt-2.5 overflow-hidden rounded-2xl sm:hidden">
        <img
          src="/brand/press-meet-hero.jpg"
          alt=""
          aria-hidden
          width={964}
          height={385}
          decoding="async"
          className="block aspect-[8/5] w-full object-cover object-[92%_center]"
        />
        <div className="absolute top-[5%] left-[3.5%] flex w-[29%] flex-col items-stretch gap-2">
          <span className="self-start">{statusChip}</span>
          <HeroDate iso={meet.startsAt} banner />
        </div>
      </div>

      <div className="flex gap-3 px-4 pt-3 pb-4 sm:gap-6 sm:px-6 sm:py-6">
        <HeroDate iso={meet.startsAt} className="max-sm:hidden" />
        <div className="min-w-0 flex-1 self-center">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="contents max-sm:hidden">{statusChip}</span>
            <span aria-hidden className="h-5 w-px bg-ink/15 max-sm:hidden" />
            <span className="inline-flex items-center gap-2 text-base font-bold text-ink sm:text-[0.9375rem] [&_svg]:size-5 [&_svg]:text-[#d10101]">
              {meet.platform === "google_meet" ? <Video aria-hidden /> : <Radio aria-hidden strokeWidth={2.25} />}
              {meet.platform === "google_meet" ? "Google Meet" : "WebNEWS Live"}
            </span>
          </div>
          <h1 id="pm-title" className="mt-1 font-wide text-[1.625rem] leading-tight font-black tracking-tight text-ink wrap-anywhere sm:mt-3 sm:text-[2.25rem]">
            {meet.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-ink max-sm:flex-col max-sm:items-stretch max-sm:gap-0 max-sm:text-[0.9375rem] sm:mt-3 sm:gap-x-3.5 sm:gap-y-1.5 sm:text-base [&_svg]:shrink-0 max-sm:[&_svg]:size-5 sm:[&_svg]:size-[1.125rem] max-sm:[&>span:not([aria-hidden])]:relative max-sm:[&>span:not([aria-hidden])]:gap-4 max-sm:[&>span:not([aria-hidden])]:py-2.5 max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:absolute max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:right-0 max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:left-9 max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:bottom-0 max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:h-px max-sm:[&>span:not([aria-hidden]):not(:last-child)]:after:bg-border">
            <span className="inline-flex items-center gap-2">
              {/* Filled red calendar and clock, like the crop; the hourglass stays an outline. */}
              <CalendarDays aria-hidden className="fill-[#d10101] text-white" strokeWidth={1.75} />
              {meetDayLong(meet.startsAt)}
            </span>
            <span aria-hidden className="text-ink/20 max-sm:hidden">|</span>
            <span className="inline-flex items-center gap-2">
              <Clock3 aria-hidden className="fill-[#d10101] text-white" strokeWidth={1.75} />
              {meetRange(meet.startsAt, meet.endsAt)} IST
            </span>
            <span aria-hidden className="text-ink/20 max-sm:hidden">|</span>
            <span className="inline-flex items-center gap-2">
              <Hourglass aria-hidden className="text-ink" />
              {durationLabel(meet.durationMinutes)}
            </span>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 empty:hidden max-sm:flex-col max-sm:items-stretch sm:mt-4 sm:gap-3">
            {attending && (
              <span className="inline-flex h-8 items-center gap-2 rounded-full bg-[#e3f5e9] px-3 text-xs font-bold text-[#0c7737] ring-1 ring-inset ring-[#b7e2c6] sm:h-9 sm:px-4 sm:text-[0.9375rem]">
                <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[#0c7737] text-white">
                  <Check aria-hidden className="size-3" strokeWidth={3.5} />
                </span>
                You&rsquo;re attending
              </span>
            )}
            <Countdown meet={meet} />
          </div>
          {attending && meet.status === "scheduled" && (
            <p className="mt-3.5 flex items-start gap-2 text-sm font-medium leading-relaxed text-ink-2">
              <Bell aria-hidden className="mt-0.5 size-4.5 shrink-0 text-[#d10101]" />
              <span>You&rsquo;ll get a reminder at 8:00 AM on the day and {PRESS_MEET.remindBeforeMinutes} minutes before it starts.</span>
            </p>
          )}
        </div>
      </div>
      {meet.agenda && (
        <div className="border-t border-tint-border bg-surface/80 px-4 py-4 sm:px-6">
          <h2 className="kicker text-muted">Agenda</h2>
          <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2 wrap-anywhere">{meet.agenda}</p>
        </div>
      )}
    </section>
  );
}

const YEAR = new Intl.DateTimeFormat("en-IN", { timeZone: PRESS_MEET.timeZone, year: "numeric" });

/** The crop's date block: weekday, the day in large figures, month and year, on its red gradient (bright at the top left, deep at the bottom right). */
function HeroDate({ iso, banner = false, className }: { iso: string; banner?: boolean; className?: string }) {
  const [weekday, day, month] = meetDay(iso).replace(",", "").split(" ");
  return (
    // Red in every state (owner 2026-10-09: it went grey once a press meet was over).
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 flex-col items-center justify-center bg-[linear-gradient(160deg,#fb1f2c_0%,#d91115_52%,#b80001_100%)] text-center leading-none text-white shadow-[0_12px_26px_-10px_rgb(0_0_0/0.5)]",
        // banner: on the phone layout's photo (owner 2026-10-12), with a light edge.
        banner
          ? "aspect-[3/4] rounded-xl ring-1 ring-white/60"
          : "w-14 min-h-24 self-center rounded-[10px] px-1 py-3 sm:min-h-40 sm:w-28 sm:rounded-[14px] sm:px-2 sm:py-5",
        className,
      )}
    >
      <span className={cn("font-bold uppercase", banner ? "text-xs tracking-[0.12em]" : "text-[0.5rem] tracking-[0.14em] sm:text-xs sm:tracking-[0.18em]")}>
        {weekday}
      </span>
      <span className={cn("font-wide font-black tabular-nums", banner ? "mt-2 text-[2.25rem]" : "mt-1.5 text-[1.625rem] sm:mt-3 sm:text-[2.5rem]")}>
        {day?.padStart(2, "0")}
      </span>
      <span
        className={cn(
          "font-bold uppercase",
          banner ? "mt-2 text-[0.625rem] tracking-[0.1em]" : "mt-1.5 text-[0.5rem] tracking-[0.14em] sm:mt-3 sm:text-xs sm:tracking-[0.18em]",
        )}
      >
        {month} {YEAR.format(new Date(iso))}
      </span>
    </span>
  );
}

/** "Starts in 2 days" · "Starts in 12 min" · at the time, "waiting for you to start" (organizer) or "for the organizer" (reporters). */
function Countdown({ meet }: { meet: PressMeetDetail }) {
  const now = useNow();
  if (now === null || meet.status !== "scheduled") return null;
  const minutes = Math.round((Date.parse(meet.startsAt) - now) / 60_000);
  let text: string;
  if (minutes > 48 * 60) text = `Starts in ${Math.round(minutes / (24 * 60))} days`;
  else if (minutes > 90) text = `Starts in ${Math.round(minutes / 60)} hours`;
  else if (minutes > 0) text = `Starts in ${minutes} min`;
  else text = meet.role === "organizer" ? "It's time — waiting for you to start" : "Waiting for the organizer to start";
  return (
    <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[#f2b1b4] bg-white px-3 py-1 text-xs font-bold text-[#d10101] max-sm:min-h-11 max-sm:justify-center max-sm:gap-2.5 max-sm:bg-tint max-sm:text-sm sm:h-9 sm:px-4 sm:py-0 sm:text-[0.9375rem]">
      <Radio aria-hidden className="size-4 shrink-0 max-sm:size-5 sm:size-4.5" strokeWidth={2.25} />
      {text}
    </p>
  );
}

/** "30 minutes", "1 hour", "1 hour 30 minutes" (the Event details card spells it out). */
function durationLong(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? "" : h === 1 ? "1 hour" : `${h} hours`;
  const mins = m === 0 ? "" : `${m} minutes`;
  return [hours, mins].filter(Boolean).join(" ");
}

function attendeesLabel(meet: PressMeetDetail): string {
  if (meet.role === "organizer") {
    return meet.visibility === "public" ? `${meet.counts.accepted} joined` : `${meet.counts.accepted} of ${meet.counts.total} accepted`;
  }
  switch (meet.myInvite?.status) {
    case "accepted":
      return "You're attending";
    case "invited":
      return "You're invited";
    case "declined":
      return meet.visibility === "public" ? "You left" : "You declined";
    default:
      return "Open to any reporter";
  }
}

/** The mockup's Event details card: Date · Time · Duration · Platform · Category · Attendees. */
function EventDetails({ meet, className }: { meet: PressMeetDetail; className?: string }) {
  const canLeave = meet.role === "reporter" && meet.myInvite?.status === "accepted" && meet.status === "scheduled";
  const rows: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; value: ReactNode }[] = [
    { icon: CalendarDays, label: "Date", value: meetDayLong(meet.startsAt) },
    { icon: Clock3, label: "Time", value: `${meetRange(meet.startsAt, meet.endsAt)} IST` },
    { icon: Hourglass, label: "Duration", value: durationLong(meet.durationMinutes) },
    { icon: meet.platform === "google_meet" ? Video : MonitorPlay, label: "Platform", value: meet.platform === "google_meet" ? "Google Meet" : "WebNEWS Live" },
    { icon: Tag, label: "Category", value: meet.visibility === "public" ? "Public press meet" : "Private press meet" },
    {
      icon: Users,
      label: "Attendees",
      value: canLeave ? (
        <>
          {attendeesLabel(meet)}
          <span className="mt-0.5 block text-xs font-medium text-muted">
            <LeaveLink meet={meet} />
          </span>
        </>
      ) : (
        attendeesLabel(meet)
      ),
    },
  ];
  return (
    <aside aria-labelledby="pm-details" className={cn("card px-5 py-5", className)}>
      <CardTitle id="pm-details" icon={Info}>
        Event details
      </CardTitle>
      <dl className="mt-2 divide-y divide-border">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 py-3">
            <Icon aria-hidden className="size-4.5 shrink-0 text-brand" />
            <dt className="w-20 shrink-0 text-sm text-muted">{label}</dt>
            <dd className="min-w-0 flex-1 text-sm font-semibold text-ink wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

/**
 * The organizer's press meet report (owner 2026-10-05; mockup 2026-10-08): a thumbnail with the file type on it, the
 * file name and size, an eye to view it (the app's own viewer, fitted to a phone's screen) and a download; for the
 * organizer, the platform fee they paid.
 */
function ReportCard({ meet, report }: { meet: PressMeetDetail; report: NonNullable<PressMeetDetail["report"]> }) {
  const url = api.pressMeets.reportUrl(meet.id);
  const image = report.mime.startsWith("image/");
  const ext = (report.fileName.includes(".") ? (report.fileName.split(".").pop() ?? "") : "").toUpperCase().slice(0, 4) || "FILE";
  return (
    <section aria-labelledby="pm-report" className="card px-5 py-5">
      <CardTitle id="pm-report" icon={FileText}>
        Press meet report
      </CardTitle>
      <div className="mt-3 flex gap-3 rounded-2xl border border-border p-3 sm:gap-4">
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-inset ring-border sm:h-24 sm:w-28">
          {image ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            // A page with a few lines of "text", like the mockup's preview.
            <div aria-hidden className="absolute inset-x-6 bottom-0 top-4 rounded-t-md bg-surface shadow-card ring-1 ring-border">
              <div className="mx-2 mt-2.5 h-1.5 w-8 rounded-sm bg-brand/70" />
              <div className="mx-2 mt-2 h-1 rounded-sm bg-border-strong" />
              <div className="mx-2 mt-1 h-1 rounded-sm bg-border-strong" />
              <div className="mx-2 mt-1 h-1 w-3/4 rounded-sm bg-border-strong" />
              <div className="mx-2 mt-2 h-1 rounded-sm bg-border" />
              <div className="mx-2 mt-1 h-1 w-2/3 rounded-sm bg-border" />
            </div>
          )}
          <span className="absolute left-1.5 top-1.5 rounded-md bg-brand px-1.5 py-0.5 text-[0.625rem] font-black uppercase tracking-wider text-brand-contrast shadow-sm">
            {ext}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-[0.9375rem] font-bold text-ink" title={report.fileName}>
            {report.fileName}
          </p>
          <p className="mt-0.5 text-xs text-muted">{fileSize(report.sizeBytes)}</p>
          {/* An eye to view it, the download beside it (owner 2026-10-12). */}
          <div className="mt-auto flex gap-2 pt-3">
            <Button href={`/press-meet/${meet.id}/report`} size="sm" variant="outline" aria-label="View the report" title="View" className={cn(RED_OUTLINE, "px-2.5")}>
              <Eye aria-hidden />
            </Button>
            <Button href={url} external download={report.fileName} size="sm" variant="outline" aria-label="Download the report" title="Download" className="px-2.5">
              <Download aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      {meet.platformFee && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-success-strong">
          <CircleCheck aria-hidden className="size-4.5" />
          Platform fee paid · {inr(meet.platformFee.amountInr)}
          {meet.platformFee.provider === "test" && <span className="font-normal text-muted">(test payment)</span>}
        </p>
      )}
    </section>
  );
}

/**
 * Who organizes it, as one small row (owner 2026-10-09: the big card was too much): the photo, the name and handle,
 * the ORGANIZER tag; the whole row opens their profile.
 */
function OrganizedBy({ meet }: { meet: PressMeetDetail }) {
  const { organizer } = meet;
  return (
    <section aria-label="Organized by" className="card">
      <Link
        href={`/${organizer.username}`}
        className="flex items-center gap-3 rounded-[inherit] px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <Avatar src={organizer.image} name={organizer.name} size={40} ring="brand" decorative />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.625rem] font-bold uppercase tracking-[0.16em] text-muted">Organized by</span>
          <span className="block truncate text-sm font-bold text-ink">{organizer.name}</span>
          <UserHandle username={organizer.username} truncate className="block text-xs font-semibold text-muted" />
        </span>
        <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-brand ring-1 ring-inset ring-tint-border">
          Organizer
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
      </Link>
    </section>
  );
}

/** The mockup's notes card: pencil title, what the notes are for, "Private to you", then the notepad. */
function NotesCard({ meet }: { meet: PressMeetDetail }) {
  return (
    <section aria-labelledby="pm-notes" className="card px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle id="pm-notes" icon={PenLine}>
            Your notes
          </CardTitle>
          <p className="mt-1 text-sm text-muted">
            {meet.role === "reporter"
              ? "Jot down important points, quotes and figures during the press meet — they're here when you write your story."
              : "Jot down important points, facts and details during the press meet. Nobody else sees them."}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-xs font-bold text-brand ring-1 ring-inset ring-tint-border">
          <Lock aria-hidden className="size-3.5" />
          Private to you
        </span>
      </div>
      <Notepad meetId={meet.id} className="mt-4" />
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden data-grid-page="" className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          <div className="card h-64 animate-pulse bg-skeleton/40" />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="card h-44 animate-pulse bg-skeleton/40" />
            <div className="card h-44 animate-pulse bg-skeleton/40" />
          </div>
        </div>
        <div className="card h-96 animate-pulse bg-skeleton/40" />
      </div>
      <div className="card h-72 animate-pulse bg-skeleton/40" />
    </div>
  );
}
