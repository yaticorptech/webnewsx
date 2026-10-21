"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleDot, ExternalLink, LogIn, Play, Radio, Square, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useNow } from "@/lib/hooks/use-now";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetDetail } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/* Shared by the organizer's and the reporter's panels on /press-meet/[id]. */


export function Panel({
  title,
  kicker,
  children,
  aside,
  className,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card px-4 py-5 sm:px-6 sm:py-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className="kicker text-brand">{kicker}</p>}
          <h2 className="mt-1 font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Join / start buttons for a live (or about to be) press meet. */
export function LiveActions({ meet, organizer }: { meet: PressMeetDetail; organizer: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const now = useNow();
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Start asks the organizer's recording consent first (owner 2026-10-05): no tick, no start.
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });

  const start = useMutation({
    mutationFn: () => api.pressMeets.start(meet.id),
    onSuccess: () => {
      setConsentOpen(false);
      refresh();
      if (meet.platform === "webnews") router.push(`/press-meet/${meet.id}/live`);
      else toast.live("You're live", { description: "Reporters who accepted have been told to join." });
    },
    onError: (error) => toast.error("Couldn't start the press meet", { description: errorMessage(error) }),
  });
  const end = useMutation({
    mutationFn: () => api.pressMeets.end(meet.id),
    onSuccess: () => {
      setConfirmEnd(false);
      refresh();
      toast.success("Press meet ended", { description: "Reporters can now send you their stories." });
    },
    onError: (error) => toast.error("Couldn't end the press meet", { description: errorMessage(error) }),
  });

  const opensAt = Date.parse(meet.startOpensAt);
  const canStart = now !== null && now >= opensAt && now <= Date.parse(meet.endsAt);

  if (meet.status === "scheduled" && organizer) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          onClick={() => {
            setConsent(false);
            setConsentOpen(true);
          }}
          disabled={!canStart}
          leftIcon={<Play aria-hidden className="fill-current" />}
        >
          Start press meet
        </Button>
        {!canStart && <p className="text-xs text-muted">You can start {PRESS_MEET.startEarlyMinutes} minutes before the scheduled time.</p>}
        <RecordingConsentDialog
          open={consentOpen}
          onOpenChange={setConsentOpen}
          consent={consent}
          onConsent={setConsent}
          starting={start.isPending}
          onStart={() => start.mutate()}
        />
      </div>
    );
  }
  if (meet.status !== "live") return null;
  const joinLabel = organizer ? "Enter the room" : "Join press meet";
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
      {meet.platform === "webnews" ? (
        <Button size="lg" href={`/press-meet/${meet.id}/live`} leftIcon={<Radio aria-hidden />}>
          {joinLabel}
        </Button>
      ) : meet.meetUrl ? (
        <Button size="lg" href={meet.meetUrl} external leftIcon={<Video aria-hidden />} rightIcon={<ExternalLink aria-hidden />}>
          {organizer ? "Open Google Meet" : "Join on Google Meet"}
        </Button>
      ) : null}
      {organizer && (
        <>
          <Button size="lg" variant="danger" onClick={() => setConfirmEnd(true)} leftIcon={<Square aria-hidden className="fill-current" />}>
            End press meet
          </Button>
          <Modal
            open={confirmEnd}
            onOpenChange={setConfirmEnd}
            title="End the press meet?"
            description="Everyone leaves the room and reporters can start sending their stories."
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                  Keep it going
                </Button>
                <Button onClick={() => end.mutate()} loading={end.isPending}>
                  End press meet
                </Button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}

/**
 * The organizer's recording consent before going live (owner 2026-10-05): what may be recorded and how it's used; the
 * Start button stays off until the box is ticked (the API refuses a start without it, and keeps when it was given).
 */
export function RecordingConsentDialog({
  open,
  onOpenChange,
  consent,
  onConsent,
  starting,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  starting: boolean;
  onStart: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Consent to record this press meet"
      description="Please read and confirm before you go live."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onStart} disabled={!consent} loading={starting} leftIcon={<Play aria-hidden className="fill-current" />}>
            Start press meet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-2">
        <p className="flex gap-3 rounded-2xl border border-tint-border bg-tint px-4 py-3">
          <CircleDot aria-hidden className="mt-0.5 size-4.5 shrink-0 text-brand" />
          <span>
            Press meets on WebNEWS are held for news coverage. Once you go live, the session is recorded — on your device
            and on the devices of the accredited reporters attending.
          </span>
        </p>
        <div>
          <p className="font-bold text-ink">By starting this press meet, you confirm that:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 marker:text-brand">
            <li>The session&rsquo;s video, audio and discussion are recorded on your device and the reporters&rsquo;; reporters may download and share their recording for news coverage.</li>
            <li>What is said and shown may be quoted, reported or published in news coverage, with attribution.</li>
            <li>Everyone speaking or appearing on your behalf has agreed to be recorded and reported.</li>
            <li>Your consent applies to this press meet only and is recorded with the date and time.</li>
          </ul>
        </div>
        <Checkbox
          checked={consent}
          onCheckedChange={onConsent}
          label={
            <span className="font-semibold text-ink">
              I consent to this press meet being recorded and used for news coverage as described above.
            </span>
          }
          className="rounded-xl border border-border bg-surface-2 px-3.5 py-3"
        />
      </div>
    </Modal>
  );
}

/**
 * A reporter's consent before entering the room (owner 2026-10-05): the session is recorded from the moment they join,
 * and the room's rules (they ask to speak; the organizer can mute them). Join stays off until the box is ticked (the API
 * refuses a join without it, and keeps when it was given).
 */
export function JoinConsentDialog({
  open,
  onOpenChange,
  organizerName,
  onJoin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizerName: string;
  onJoin: () => void;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setConsent(false);
        onOpenChange(next);
      }}
      title="This press meet is recorded"
      description="Please read and agree before you join."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onJoin} disabled={!consent} leftIcon={<LogIn aria-hidden />}>
            Join press meet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-2">
        <p className="flex gap-3 rounded-2xl border border-tint-border bg-tint px-4 py-3">
          <CircleDot aria-hidden className="mt-0.5 size-4.5 shrink-0 text-brand" />
          <span>
            <strong className="text-ink">This session is fully recorded.</strong> Recording starts as soon as you join — your
            video, your voice when you speak and your chat messages become part of the recording.
          </span>
        </p>
        <div>
          <p className="font-bold text-ink">By joining this press meet, you agree that:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 marker:text-brand">
            <li>The press meet, including your video, voice and messages, is recorded from the moment you join.</li>
            <li>The recording is saved on your device; you may download it and share it for news coverage of this press meet.</li>
            <li>You will use the recording, and anything you share from it, only for fair and accurate reporting, with credit to the organizer.</li>
            <li>Your camera stays on for the whole press meet and can&rsquo;t be turned off.</li>
            <li>
              Your microphone stays off until you ask to speak and {organizerName} accepts; the organizer can mute you at any
              time.
            </li>
            <li>You will ask questions on the topic, be respectful, and report what is said fairly and accurately.</li>
            <li>Your consent applies to this press meet only and is recorded with the date and time.</li>
          </ul>
        </div>
        <Checkbox
          checked={consent}
          onCheckedChange={setConsent}
          label={<span className="font-semibold text-ink">I have read and agree to these terms, and I consent to being recorded in this press meet.</span>}
          className="rounded-xl border border-border bg-surface-2 px-3.5 py-3"
        />
      </div>
    </Modal>
  );
}
