"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarX2,
  Check,
  CircleCheckBig,
  Clapperboard,
  FilePen,
  Globe,
  Play,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { deleteLocalRecording, useLocalRecordings, type LocalRecording } from "@/lib/local-recordings";
import { qk } from "@/lib/query-keys";
import type { PressMeetDetail } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { inr } from "../format";
import { RecordingActions } from "./recording-actions";
import { RecordingPlayer } from "./recording-player";
import { LiveActions, Panel } from "./shared";

/**
 * A reporter's side of a press meet: the invitation (Accept / Decline), joining when it's live, then — once it's over
 * — writing and sending their story, the organizer's verdict (verifying publishes it), and confirming the fee reached them. Their recordings
 * of the room play here, and they can download and share them (owner 2026-10-05).
 */
export function ReporterPanel({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
  const isPublic = meet.visibility === "public";
  const seated = meet.myInvite?.status === "accepted";
  // A public press meet the viewer hasn't taken a seat in (owner 2026-10-07): join it from here.
  if (isPublic && !seated) return <PublicSeat meet={meet} onChange={refresh} />;
  return <InvitedPanel meet={meet} refresh={refresh} />;
}

/**
 * A public press meet the viewer isn't in (owner 2026-10-07): who's holding it, and Join — no seat counts or "first
 * come, first served" anywhere (owner 2026-10-07). Only reporters with a Press Pass can join; others just see it.
 */
function PublicSeat({ meet, onChange }: { meet: PressMeetDetail; onChange: () => void }) {
  const viewer = useViewer();
  const now = useNow();
  const reporter = viewer?.role === "reporter";
  // Past its slot end nobody can join any more (the API refuses), even while the organizer is still live in the room
  // (owner 2026-10-08): the page says it's over instead of offering Join.
  const slotOver = now !== null && now > Date.parse(meet.endsAt);
  const open = meet.status === "scheduled" || (meet.status === "live" && !slotOver);
  const full = (meet.seatsLeft ?? 0) <= 0;
  const join = useMutation({
    mutationFn: () => api.pressMeets.joinPublic(meet.id),
    onSuccess: () => {
      onChange();
      toast.success("You're in", {
        description: meet.status === "live" ? "Join the room from here." : `${meet.organizer.name} has been told. You'll be reminded before it starts.`,
      });
    },
    onError: (error) => {
      onChange();
      toast.error("Couldn't join", { description: errorMessage(error) });
    },
  });

  if (meet.status === "cancelled") {
    return (
      <Notice icon={<CalendarX2 aria-hidden />} title="This press meet was cancelled">
        {meet.organizer.name} cancelled it.
      </Notice>
    );
  }
  if (!open) {
    return (
      <Notice icon={<CalendarX2 aria-hidden />} title="This press meet is over">
        {meet.myInvite ? "You left before it ended." : meet.status === "live" ? "Its time slot has ended, so nobody can join it now." : "You didn't join it."}
      </Notice>
    );
  }
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-success/25 bg-success-soft px-4 py-4 sm:px-6">
        <p className="kicker flex items-center gap-1.5 text-success-strong">
          <Globe aria-hidden className="size-3.5" />
          Public press meet
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">
          <strong className="font-bold text-ink">{meet.organizer.name}</strong> is holding a public press meet — any reporter can join.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        {reporter ? (
          <>
            <Button size="lg" onClick={() => join.mutate()} loading={join.isPending} disabled={full} leftIcon={<UserPlus aria-hidden />}>
              {full ? "Full" : meet.status === "live" ? "Join now" : "Join press meet"}
            </Button>
            <p className="text-xs leading-relaxed text-muted">
              Afterwards you write your story here and send it to {meet.organizer.name}, who verifies it before it goes live.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Reporters with a Press Pass can join public press meets.</p>
        )}
      </div>
    </section>
  );
}

function InvitedPanel({ meet, refresh }: { meet: PressMeetDetail; refresh: () => void }) {
  const invite = meet.myInvite!;
  const isPublic = meet.visibility === "public";

  const respond = useMutation({
    mutationFn: (accept: boolean) => api.pressMeets.respond(meet.id, accept),
    onSuccess: (_, accept) => {
      refresh();
      if (isPublic) toast(accept ? "You're in" : "You left the press meet", { description: `${meet.organizer.name} has been told.` });
      else if (accept) toast.success("Invitation accepted", { description: `${meet.organizer.name} has been told you'll be there.` });
      else toast("Invitation declined", { description: `${meet.organizer.name} has been told.` });
    },
    onError: (error) => toast.error("Couldn't send your answer", { description: errorMessage(error) }),
  });

  const open = meet.status === "scheduled" || meet.status === "live";
  const held = meet.status === "ended" && meet.startedAt !== null;

  return (
    <>
      {meet.status === "cancelled" && (
        <Notice icon={<CalendarX2 aria-hidden />} title="This press meet was cancelled">
          {meet.organizer.name} cancelled it. Nothing more to do here.
        </Notice>
      )}
      {meet.status === "ended" && !meet.startedAt && (
        <Notice icon={<CalendarX2 aria-hidden />} title="This press meet didn't take place">
          The organizer never started it.
        </Notice>
      )}

      {open && invite.status === "invited" && (
        <section className="card overflow-hidden">
          <div className="border-b border-tint-border bg-tint px-4 py-4 sm:px-6">
            <p className="kicker text-brand">Invitation</p>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">
              <strong className="font-bold text-ink">{meet.organizer.name}</strong> has invited you to cover this press meet. Your advertorial
              price for attending and publishing your story: <strong className="font-bold text-ink">{inr(invite.price)}</strong>.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 px-4 py-4 sm:flex-row sm:px-6">
            <Button size="lg" onClick={() => respond.mutate(true)} loading={respond.isPending && respond.variables} leftIcon={<ThumbsUp aria-hidden />}>
              {meet.status === "live" ? "Accept & join" : "Accept invitation"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => respond.mutate(false)} loading={respond.isPending && !respond.variables} leftIcon={<ThumbsDown aria-hidden />}>
              Decline
            </Button>
          </div>
        </section>
      )}

      {/* Scheduled and accepted: the hero carries "You're attending", the reminder line and Leave (mockup 2026-10-08). */}
      {meet.status === "live" && invite.status === "accepted" && (
        <section className="card flex flex-col gap-4 px-4 py-5 sm:px-6">
          <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 animate-heartbeat-ring rounded-full bg-brand" />
              <span className="relative size-2.5 rounded-full bg-brand" />
            </span>
            {meet.organizer.name} is live now
          </p>
          <LiveActions meet={meet} organizer={false} />
          {meet.platform === "webnews" && (
            <p className="text-xs leading-relaxed text-muted">
              You join on camera (it stays on for the whole press meet) with your microphone off — ask to speak, and it turns on once the organizer accepts. The press meet is recorded on your device from the moment you join; download or share the recording from here afterwards.
            </p>
          )}
        </section>
      )}

      {open && invite.status === "declined" && (
        <Notice icon={<ThumbsDown aria-hidden />} title="You declined this invitation">
          Changed your mind?{" "}
          <button type="button" onClick={() => respond.mutate(true)} className="font-bold text-brand hover:underline">
            Accept instead
          </button>
        </Notice>
      )}

      {held && invite.status === "accepted" && <StoryAndPayment meet={meet} />}
      {held && invite.status !== "accepted" && (
        <Notice icon={<CalendarX2 aria-hidden />} title="You didn't attend this press meet">
          You {invite.status === "declined" ? "declined" : "didn't answer"} the invitation.
        </Notice>
      )}

    </>
  );
}

/**
 * "Can't make it? Leave / Decline" in the hero's reminder line (mockup 2026-10-08) for a reporter who accepted a
 * scheduled press meet: frees their seat; the organizer is told.
 */
export function LeaveLink({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const isPublic = meet.visibility === "public";
  const leave = useMutation({
    mutationFn: () => api.pressMeets.respond(meet.id, false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
      toast(isPublic ? "You left the press meet" : "Invitation declined", { description: `${meet.organizer.name} has been told.` });
    },
    onError: (error) => toast.error("Couldn't send your answer", { description: errorMessage(error) }),
  });
  return (
    <button type="button" onClick={() => leave.mutate()} disabled={leave.isPending} className="font-bold text-brand hover:underline disabled:opacity-60">
      {isPublic ? "Can’t make it? Leave" : "Can’t make it? Decline"}
    </button>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card flex items-start gap-3 px-4 py-4 sm:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </section>
  );
}

const TRACK = ["Covered", "Story sent", "Verified", "Paid"] as const;

/**
 * After the press meet: write the story → send it to the organizer → they verify it, which publishes it (owner
 * 2026-10-07: never live before that, for every reporter) → they release the fee → confirm it arrived. "Write your
 * story" opens the composer linked to this press meet (one story per press meet; a draft carries on with "Continue");
 * after a request for changes: edit it and send it again. Once verified it's locked.
 */
function StoryAndPayment({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const invite = meet.myInvite!;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
  const writeHref = `/publish?pressMeet=${meet.id}`;
  const story = invite.article;
  const editHref = story?.id ? `/publish/${story.id}` : writeHref;

  const received = useMutation({
    mutationFn: () => api.pressMeets.received(meet.id),
    onSuccess: () => {
      refresh();
      toast.success("Payment confirmed", { description: "Thanks — the organizer has been told." });
    },
    onError: (error) => toast.error("Couldn't confirm", { description: errorMessage(error) }),
  });

  const stage = invite.payment === "received" ? 4 : invite.review === "approved" ? 3 : invite.review === "pending" ? 2 : 1;

  return (
    <Panel
      kicker="After the press meet"
      title={invite.price === 0 ? "Your story" : "Your story & fee"}
      // No fee shown on a public press meet (owner 2026-10-07: no "free" / "no fee" anywhere).
      aside={invite.price > 0 ? <span className="font-wide text-xl font-black tabular-nums text-brand">{inr(invite.price)}</span> : undefined}
    >
      {/* Each step: a circle (red with a check once done) joined to the next by a line, its name under it. */}
      {/* A free seat (public press meet) ends at "Verified": no fee steps. */}
      <ol className={cn("mb-5 grid", invite.price === 0 ? "grid-cols-3" : "grid-cols-4")}>
        {(invite.price === 0 ? TRACK.slice(0, 3) : TRACK).map((label, index) => {
          const done = index < stage;
          return (
            <li key={label} className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-2 pr-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full sm:size-5.5",
                    done ? "bg-brand text-brand-contrast" : "border border-border-strong text-faint",
                  )}
                >
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
                <span aria-hidden className={cn("h-0.5 flex-1 rounded-full", done ? "bg-brand" : "bg-tint-3")} />
              </span>
              <span className={cn("truncate pl-0.5 text-[0.625rem] font-bold uppercase tracking-wider sm:pl-7 sm:text-[0.6875rem]", done ? "text-ink" : "text-muted")}>
                <span className="sr-only">{done ? "Done: " : "To do: "}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {invite.review === "changes" && invite.reviewNote && (
        <div className="mb-4 rounded-xl bg-tint px-3.5 py-3 ring-1 ring-inset ring-tint-border">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">{meet.organizer.name} asked for changes</p>
          <p className="mt-1 text-sm italic leading-relaxed text-ink-2">&ldquo;{invite.reviewNote}&rdquo;</p>
          <p className="mt-1.5 text-xs text-muted">Edit your story, then send it again.</p>
        </div>
      )}

      {story && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5">
          {story.coverUrl && <img src={story.coverUrl} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted">
              {invite.review === "approved"
                ? "Verified · live on WebNEWS"
                : invite.review === null
                  ? "Draft · not sent yet"
                  : `Sent ${invite.submittedAt ? formatDate(invite.submittedAt, "short") : ""}`}
            </p>
            <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{story.title}</p>
          </div>
          {invite.review !== "approved" && story.id && (
            <Button href={editHref} size="sm" variant="outline" leftIcon={<FilePen aria-hidden />}>
              {invite.review === "pending" ? "Open" : "Edit"}
            </Button>
          )}
          {story.slug && (
            <Button href={`/a/${story.slug}`} size="sm" variant="outline">
              View
            </Button>
          )}
        </div>
      )}

      {invite.review === null ? (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 px-4 py-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">
            {story ? "Finish your story" : "Write your story about this press meet"} and send it to {meet.organizer.name}. It goes live on
            WebNEWS once they verify it — and can&rsquo;t be changed after that.
          </p>
          <Button href={editHref} leftIcon={<FilePen aria-hidden />} className="shrink-0 self-start sm:self-auto">
            {story ? "Continue your story" : "Write your story"}
          </Button>
        </div>
      ) : invite.review === "changes" ? (
        <Button href={editHref} leftIcon={<Send aria-hidden />} className="self-start">
          Edit &amp; send again
        </Button>
      ) : invite.review === "pending" ? (
        <p className="text-sm text-muted">
          Waiting for {meet.organizer.name} to verify your story. It goes live on WebNEWS once they do.
        </p>
      ) : invite.payment === "unpaid" ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-success-strong">
          <BadgeCheck aria-hidden className="size-5" />
          {invite.price === 0 ? "Verified and live on WebNEWS." : <>Verified and live — {meet.organizer.name} will release your {inr(invite.price)}.</>}
        </p>
      ) : invite.payment === "released" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-success-soft px-4 py-3.5">
          <p className="text-sm font-semibold text-success-strong">
            {meet.organizer.name} has released {inr(invite.price)} to you{invite.paymentRef ? ` (ref ${invite.paymentRef})` : ""}.
          </p>
          <Button onClick={() => received.mutate()} loading={received.isPending} leftIcon={<Wallet aria-hidden />} className="self-start">
            I&rsquo;ve received it
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold text-success-strong">
          <CircleCheckBig aria-hidden className="size-5" />
          Paid · {inr(invite.price)} received{invite.receivedAt ? ` on ${formatDate(invite.receivedAt, "short")}` : ""}.
        </p>
      )}
    </Panel>
  );
}

/**
 * Your recordings of this press meet saved on this device (owner 2026-10-02: never on the server) — the reporter's
 * and the organizer's alike (owner 2026-10-05), beside the notes at the bottom of the page.
 */
export function ReporterRecordings({ meet, className }: { meet: PressMeetDetail; className?: string }) {
  const viewer = useViewer();
  const { recordings, refresh } = useLocalRecordings(meet.id, viewer?.id ?? null);
  const [playing, setPlaying] = useState<LocalRecording | null>(null);
  if (recordings.length === 0) return null;
  const remove = async (id: string) => {
    if (!window.confirm("Delete this recording from this device? It can't be brought back.")) return;
    try {
      await deleteLocalRecording(id);
      refresh();
      toast("Recording deleted");
    } catch {
      toast.error("Couldn't delete it");
    }
  };
  return (
    <Panel kicker="Saved on this device" title="Your recordings" className={className}>
      <p className="-mt-2 mb-3 text-xs leading-relaxed text-muted">
        Play, download or share them. They&rsquo;re kept on this phone or browser — uninstalling the app or clearing this
        browser&rsquo;s data removes them, so download the ones you want to keep.
      </p>
      <ul className="flex flex-col gap-2">
        {recordings.map((rec, index) => (
          <li key={rec.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink/90 text-white dark:bg-surface-3">
              <Clapperboard aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">Recording {recordings.length - index}</span>
              <span className="block text-xs text-muted">
                {rec.durationMs ? `${formatClock(rec.durationMs)} · ` : ""}
                {formatDate(rec.createdAt, "date-time")}
              </span>
            </span>
            <Button size="sm" onClick={() => setPlaying(rec)} leftIcon={<Play aria-hidden className="fill-current" />}>
              Play
            </Button>
            <RecordingActions recording={rec} title={meet.title} />
            <button
              type="button"
              onClick={() => void remove(rec.id)}
              aria-label="Delete recording"
              className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-tint hover:text-brand"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <RecordingPlayer recording={playing} title={meet.title} onClose={() => setPlaying(null)} />
    </Panel>
  );
}

export function formatClock(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
