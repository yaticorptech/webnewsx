"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarCheck2, Globe, MonitorPlay, UserCheck, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StepRail } from "@/components/presspass/step-rail";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  GOOGLE_MEET_URL_REGEX,
  PRESS_MEET,
  istDateKey,
  type PlatformFeePayment,
  type PressMeetDuration,
  type PressMeetPlatform,
  type PressMeetVisibility,
  type PressMeetReportFile,
  type PressMeetReporter,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { durationLabel, inr, meetDay, meetRange } from "../format";
import { PageHeading } from "../parts";
import { PlatformFeePay, ReportUpload, usePlatformFee } from "./booking-extras";
import { ReporterPicker } from "./reporter-picker";
import { SlotPicker, type ChosenSlot } from "./slot-picker";

const STEPS = [
  { key: "when", label: "Date & time", short: "When" },
  { key: "who", label: "Reporters", short: "Who" },
  { key: "details", label: "Details", short: "Details" },
] as const;

type Errors = { title?: string; meetUrl?: string };

/**
 * /press-meet/new (owner 2026-10-01): 1. date & time on the shared calendar → 2. who can join: Verified reporters you
 * invite (with their prices), or public — any reporter, free, first come first served (owner 2026-10-07) → 3. title, the press meet report, WebNEWS Live or Google Meet and the platform fee (report and fee required,
 * owner 2026-10-05) → Schedule press meet (only once the report is uploaded and the fee paid; no summary card, owner
 * 2026-10-05). The bar along the bottom keeps the choice so far and the total in view.
 */
export function BookingWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);

  const [duration, setDuration] = useState<PressMeetDuration>(60);
  const [month, setMonth] = useState(() => istDateKey(Date.now()).slice(0, 7));
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<ChosenSlot | null>(null);
  const [selected, setSelected] = useState<ReadonlyMap<string, PressMeetReporter>>(() => new Map());
  /** Invite chosen reporters, or public: any reporter joins, free, first come first served (owner 2026-10-07). */
  const [visibility, setVisibility] = useState<PressMeetVisibility>("invited");
  const isPublic = visibility === "public";
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<PressMeetPlatform>("webnews");
  const [meetUrl, setMeetUrl] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [report, setReport] = useState<PressMeetReportFile | null>(null);
  const [payment, setPayment] = useState<PlatformFeePayment | null>(null);
  const fee = usePlatformFee();

  const reporters = isPublic ? [] : [...selected.values()];
  const total = reporters.reduce((sum, r) => sum + (r.price ?? 0), 0);
  // Free (₹0) needs no payment; until the fee has loaded, it counts as unpaid.
  const feeDone = payment !== null || fee.data?.amountInr === 0;
  const todo = [!report && "upload the report", !feeDone && "pay the platform fee"].filter(Boolean).join(" · ");

  const go = (next: number) => {
    setStep(next);
    setReached((r) => Math.max(r, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleReporter = (reporter: PressMeetReporter) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(reporter.id)) next.delete(reporter.id);
      else next.set(reporter.id, reporter);
      return next;
    });

  const create = useMutation({
    mutationFn: () =>
      api.pressMeets.create({
        title: title.trim(),
        agenda: null,
        startsAt: slot!.start,
        durationMinutes: duration,
        platform,
        meetUrl: platform === "google_meet" ? meetUrl.trim() : null,
        visibility,
        reporterIds: reporters.map((r) => r.id),
        reportId: report!.id,
        platformFeePaymentId: payment?.id ?? null,
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
      toast.success("Press meet scheduled", {
        description: isPublic
          ? "Every reporter has been told."
          : `Invitations sent to ${reporters.length} ${reporters.length === 1 ? "reporter" : "reporters"}.`,
      });
      router.push(`/press-meet/${id}`);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "slot_taken") {
        void queryClient.invalidateQueries({ queryKey: ["press-meets", "slots"] });
        void queryClient.invalidateQueries({ queryKey: ["press-meets", "calendar"] });
        setSlot(null);
        go(0);
      } else if (isApiError(error) && error.code === "invalid_slot") {
        setSlot(null);
        go(0);
      } else if (isApiError(error) && error.code === "reporters_unavailable") {
        void queryClient.invalidateQueries({ queryKey: ["press-meets", "reporters"] });
        setSelected(new Map());
        go(1);
      } else if (isApiError(error) && error.code === "report_required") {
        setReport(null);
      } else if (isApiError(error) && error.code === "platform_fee_required") {
        setPayment(null);
        void fee.refetch();
      } else if (isApiError(error) && error.fields) {
        setErrors({ title: error.fields.title, meetUrl: error.fields.meetUrl });
      }
      toast.error("Couldn't schedule the press meet", { description: error.message });
    },
  });

  const validateDetails = (): boolean => {
    const next: Errors = {};
    const trimmed = title.trim();
    if (trimmed.length < PRESS_MEET.titleMin) next.title = `Give it a title of at least ${PRESS_MEET.titleMin} characters`;
    if (platform === "google_meet" && !GOOGLE_MEET_URL_REGEX.test(meetUrl.trim())) {
      next.meetUrl = "Paste a Google Meet link like https://meet.google.com/abc-defg-hij";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const canNext = step === 0 ? slot !== null : step === 1 ? isPublic || selected.size > 0 : true;

  return (
    <div className="flex flex-col gap-6" data-grid-page="">
      <PageHeading
        kicker="Press meet"
        backFallback="/press-meet"
        title="Schedule a press meet"
        description="Pick a time, choose the reporters you want there, and send the invitations."
      />
      <StepRail steps={STEPS} current={step} reached={reached} onSelect={go} label="Press meet steps" className="max-w-2xl" />

      <div className="min-h-[50vh]">
        {step === 0 && (
          <SlotPicker
            duration={duration}
            onDuration={(value) => {
              setDuration(value);
              setSlot(null);
            }}
            month={month}
            onMonth={setMonth}
            date={date}
            onDate={(value) => {
              setDate(value);
              setSlot(null);
            }}
            slot={slot}
            onSlot={setSlot}
          />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            {/* Who can join (owner 2026-10-07): the reporters you invite, or any reporter. */}
            <div role="radiogroup" aria-label="Who can join" className="grid max-w-3xl gap-3 sm:grid-cols-2">
              <PlatformOption
                active={!isPublic}
                onSelect={() => setVisibility("invited")}
                icon={<UserCheck aria-hidden />}
                title="Invite reporters"
                text="Choose Verified reporters; each one is paid the price they set."
              />
              <PlatformOption
                active={isPublic}
                onSelect={() => setVisibility("public")}
                icon={<Globe aria-hidden />}
                title="Public — any reporter"
                text="Every reporter is told when you book it and when it goes live. No invitations to send."
              />
            </div>
            {isPublic ? (
              <p className="flex max-w-3xl items-start gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3.5 text-sm leading-relaxed text-ink">
                <Globe aria-hidden className="mt-0.5 size-4.5 shrink-0 text-success-strong" />
                <span>
                  No invitations to send: reporters see it under <strong>Public press meets</strong> and join themselves.
                  Their stories still come to you to verify before they go live.
                </span>
              </p>
            ) : (
              <ReporterPicker selected={selected} onToggle={toggleReporter} />
            )}
          </div>
        )}
        {step === 2 && slot && (
          <div>
            <section aria-labelledby="pm-details" className="card flex flex-col gap-5 p-5 sm:p-7">
              <h2 id="pm-details" className="font-wide text-lg font-extrabold text-ink">
                About the press meet
              </h2>
              <Field label="Title" required error={errors.title} hint="Reporters see this in their invitation.">
                <Input
                  value={title}
                  maxLength={PRESS_MEET.titleMax}
                  placeholder="e.g. Launch of the Mysuru Dasara 2026 programme"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
                  }}
                />
              </Field>
              {/* The report took the Agenda box's place (owner 2026-10-05: no agenda field). */}
              <ReportUpload report={report} onChange={setReport} />

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 text-sm font-bold text-ink">Where will it happen?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PlatformOption
                    active={platform === "webnews"}
                    onSelect={() => setPlatform("webnews")}
                    icon={<MonitorPlay aria-hidden />}
                    title="WebNEWS Live"
                    badge="Recommended"
                    text="Our built-in room: you on camera with the WebNEWS mark, reporters ask questions by mic and can record it."
                  />
                  <PlatformOption
                    active={platform === "google_meet"}
                    onSelect={() => setPlatform("google_meet")}
                    icon={<Video aria-hidden />}
                    title="Google Meet"
                    text="Create the meeting in Google Meet and paste its link — reporters who accept get it."
                  />
                </div>
                {platform === "google_meet" && (
                  <Field label="Google Meet link" required error={errors.meetUrl}>
                    <Input
                      value={meetUrl}
                      inputMode="url"
                      placeholder="https://meet.google.com/abc-defg-hij"
                      onChange={(event) => {
                        setMeetUrl(event.target.value);
                        if (errors.meetUrl) setErrors((e) => ({ ...e, meetUrl: undefined }));
                      }}
                    />
                  </Field>
                )}
              </fieldset>

              <PlatformFeePay payment={payment} onPaid={setPayment} />
            </section>
          </div>
        )}
      </div>

      {/* The bar along the bottom: what's chosen so far, and the way on. */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+0.5rem)] z-20 md:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-nav px-3 py-2.5 shadow-pop backdrop-blur-md sm:px-4">
          <div className="min-w-0 flex-1">
            {slot ? (
              <p className="truncate text-sm font-bold text-ink">
                {meetDay(slot.start)} · {meetRange(slot.start, slot.end)}
              </p>
            ) : (
              <p className="truncate text-sm font-semibold text-muted">Choose a date and time</p>
            )}
            <p className="truncate text-xs text-muted">
              {step === 2 && todo ? (
                <span className="font-semibold text-brand">To schedule: {todo}</span>
              ) : isPublic && step > 0 ? (
                <>
                  Public · any reporter can join
                </>
              ) : selected.size > 0 ? (
                <>
                  {selected.size} {selected.size === 1 ? "reporter" : "reporters"} · <strong className="font-bold text-ink">{inr(total)}</strong>
                </>
              ) : (
                `${durationLabel(duration)} · IST`
              )}
            </p>
          </div>
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(step - 1)} leftIcon={<ArrowLeft aria-hidden />} className="max-sm:px-3 max-sm:[&>span]:sr-only">
              <span>Back</span>
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => go(step + 1)} disabled={!canNext} rightIcon={<ArrowRight aria-hidden />}>
              Next
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (validateDetails()) create.mutate();
              }}
              disabled={Boolean(todo)}
              title={todo ? `To schedule: ${todo}` : undefined}
              loading={create.isPending}
              leftIcon={<CalendarCheck2 aria-hidden />}
            >
              Schedule press meet
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlatformOption({
  active,
  onSelect,
  icon,
  title,
  text,
  badge,
}: {
  active: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-2 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow]",
        active ? "border-brand bg-tint ring-1 ring-brand" : "border-border-strong bg-surface hover:border-tint-border",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full [&_svg]:size-4.5",
            active ? "bg-brand text-brand-contrast" : "bg-tint text-brand",
          )}
        >
          {icon}
        </span>
        <span className="font-wide text-[0.9375rem] font-extrabold text-ink">{title}</span>
        {badge && <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-success-strong">{badge}</span>}
      </span>
      <span className="text-xs leading-relaxed text-muted">{text}</span>
    </button>
  );
}
