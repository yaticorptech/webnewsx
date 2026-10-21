"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarX2, FileText, IndianRupee, MessageSquareWarning, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetDetail, type PressMeetInvite } from "@/lib/shared/contracts";
import { inr, inviteStage } from "../format";
import { Chip } from "../parts";
import { InviteMore } from "./invite-more";
import { LiveActions, Panel } from "./shared";
import { StoryReview } from "./story-review";

/** The organizer's start / end, and cancel (while it's scheduled or live). */
export function OrganizerStart({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.pressMeets.cancel(meet.id),
    onSuccess: () => {
      setConfirmCancel(false);
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
      toast.success("Press meet cancelled", { description: "The reporters have been told, and the time slot is free again." });
    },
    onError: (error) => toast.error("Couldn't cancel", { description: errorMessage(error) }),
  });

  if (meet.status !== "scheduled" && meet.status !== "live") return null;
  return (
    <>
      <section className="card flex flex-col gap-4 px-4 py-5 sm:px-6">
        <LiveActions meet={meet} organizer />
        {meet.status === "scheduled" && (
          <p className="text-xs leading-relaxed text-muted">
            Everyone gets a reminder at 8 AM on the day and {PRESS_MEET.remindBeforeMinutes} minutes before.{" "}
            <button type="button" onClick={() => setConfirmCancel(true)} className="font-bold text-brand hover:underline">
              Cancel press meet
            </button>
          </p>
        )}
      </section>

      <Modal
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this press meet?"
        description="The invited reporters are told it's off, and the time slot opens up for others."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending} leftIcon={<CalendarX2 aria-hidden />}>
              Cancel press meet
            </Button>
          </>
        }
      />
    </>
  );
}

/**
 * The organizer's reporters: every invited reporter — their answer, the story they sent and their fee. Start / end /
 * cancel is OrganizerStart (owner 2026-10-12: on computers it sits under the organizer card). Their stories: Read ·
 * Verify & publish · Ask for changes (owner 2026-10-07: it isn't live until they verify it); fees: Release payment →
 * they confirm — paid outside WebNEWS for now (owner 2026-10-01), recorded with an optional UPI / bank reference.
 */
export function OrganizerPanel({ meet }: { meet: PressMeetDetail }) {
  const active = meet.invites.filter((i) => i.status !== "declined");
  const owed = active.filter((i) => i.review === "approved").reduce((sum, i) => sum + i.price, 0);
  const paid = active.filter((i) => i.payment !== "unpaid").reduce((sum, i) => sum + i.price, 0);
  const over = meet.status === "ended" && meet.startedAt !== null;
  const isPublic = meet.visibility === "public";

  return (
    <>
      <Panel
        kicker={over ? "After the press meet" : isPublic ? "Public press meet" : "Invitations"}
        title="Reporters"
        aside={
          isPublic ? (
            <div className="flex gap-2 text-right">
              <Stat label="Joined" value={String(meet.counts.accepted)} />
            </div>
          ) : (
            <div className="flex gap-2 text-right">
              <Stat label="Accepted" value={`${meet.counts.accepted}/${meet.counts.total}`} />
              <Stat label="Advertorial" value={inr(meet.totalAmount)} />
              {over && <Stat label="Released" value={inr(paid)} />}
            </div>
          )
        }
      >
        {isPublic && !over && (
          <p className="mb-4 rounded-xl bg-success-soft px-3.5 py-3 text-sm leading-relaxed text-ink-2">
            Any reporter can join. Every reporter was told when you booked it and will be told again when you go live.
            {meet.invites.length === 0 && <span className="mt-1 block font-semibold text-ink">No one has joined yet.</span>}
          </p>
        )}
        {over && isPublic && (
          <p className="mb-4 rounded-xl bg-tint px-3.5 py-3 text-sm leading-relaxed text-ink-2 ring-1 ring-inset ring-tint-border">
            Each reporter writes their story and sends it here — it isn&rsquo;t published until you <strong className="font-bold">verify</strong> it.
            Read it, then verify it (that publishes it on WebNEWS) or ask for changes.
          </p>
        )}
        {over && !isPublic && (
          <p className="mb-4 rounded-xl bg-tint px-3.5 py-3 text-sm leading-relaxed text-ink-2 ring-1 ring-inset ring-tint-border">
            Each reporter writes their story and sends it here — it isn&rsquo;t published until you{" "}
            <strong className="font-bold">verify</strong> it. Read it, verify it (that publishes it on WebNEWS) or ask for changes, then{" "}
            <strong className="font-bold">release their fee</strong> — paid directly to them; record the UPI or bank reference so both of
            you have it.
            {owed > paid && (
              <span className="mt-1 block font-bold text-brand">
                {inr(owed - paid)} verified and waiting to be released.
              </span>
            )}
          </p>
        )}
        <ul className="flex flex-col divide-y divide-border">
          {meet.invites.map((invite) => (
            <InviteRow key={invite.id} meet={meet} invite={invite} />
          ))}
        </ul>
        {!isPublic && <InviteMore meet={meet} />}
      </Panel>

    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-16 flex-col rounded-xl bg-surface-2 px-2.5 py-1.5">
      <span className="text-[0.625rem] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="font-wide text-sm font-black tabular-nums text-ink">{value}</span>
    </span>
  );
}

function InviteRow({ meet, invite }: { meet: PressMeetDetail; invite: PressMeetInvite }) {
  const queryClient = useQueryClient();
  const stage = inviteStage(invite, meet, "organizer");
  const [changesOpen, setChangesOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });

  const review = useMutation({
    mutationFn: (approve: boolean) => api.pressMeets.review(meet.id, invite.id, approve, approve ? null : note.trim()),
    onSuccess: (_, approve) => {
      refresh();
      setChangesOpen(false);
      setReading(false);
      setNote("");
      toast.success(approve ? "Story verified and published" : "Changes requested", {
        description: approve
          ? invite.price === 0
            ? "It's live on WebNEWS."
            : `It's live on WebNEWS. Now release ${inr(invite.price)} to ${invite.reporter.name}.`
          : `${invite.reporter.name} has been told what to change.`,
      });
    },
    onError: (error) => toast.error("Couldn't save your review", { description: errorMessage(error) }),
  });
  const release = useMutation({
    mutationFn: () => api.pressMeets.release(meet.id, invite.id, reference.trim() || null),
    onSuccess: () => {
      refresh();
      setReleaseOpen(false);
      toast.success("Payment released", { description: `${invite.reporter.name} will confirm once it reaches them.` });
    },
    onError: (error) => toast.error("Couldn't release the payment", { description: errorMessage(error) }),
  });

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar src={invite.reporter.image} name={invite.reporter.name} size={44} decorative />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-bold text-ink">{invite.reporter.name}</p>
          <UserHandle username={invite.reporter.username} truncate className="block text-xs font-semibold text-brand" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={stage.tone}>{stage.label}</Chip>
          {/* No fee line on a public press meet (owner 2026-10-07: no "free" / "no fee" anywhere). */}
          {invite.price > 0 && <span className="text-sm font-black tabular-nums text-ink">{inr(invite.price)}</span>}
        </div>
      </div>

      {invite.article && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5">
          {invite.article.coverUrl ? (
            <img src={invite.article.coverUrl} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-tint text-brand">
              <FileText aria-hidden className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted">Their story</p>
            <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{invite.article.title}</p>
          </div>
          {invite.article.slug ? (
            <Button href={`/a/${invite.article.slug}`} size="sm" variant="outline">
              Open
            </Button>
          ) : (
            invite.article.id && (
              <Button size="sm" variant="outline" onClick={() => setReading(true)}>
                Read
              </Button>
            )
          )}
        </div>
      )}

      {invite.review === "changes" && invite.reviewNote && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          You asked: <span className="italic text-ink-2">&ldquo;{invite.reviewNote}&rdquo;</span>
        </p>
      )}

      {invite.review === "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => review.mutate(true)} loading={review.isPending && review.variables === true} leftIcon={<BadgeCheck aria-hidden />}>
            Verify &amp; publish
          </Button>
          <Button size="sm" variant="outline" onClick={() => setChangesOpen(true)} leftIcon={<MessageSquareWarning aria-hidden />}>
            Ask for changes
          </Button>
        </div>
      )}
      {invite.review === "approved" && invite.payment === "unpaid" && invite.price > 0 && (
        <Button size="sm" onClick={() => setReleaseOpen(true)} leftIcon={<Wallet aria-hidden />} className="self-start">
          Release {inr(invite.price)}
        </Button>
      )}
      {invite.payment !== "unpaid" && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <IndianRupee aria-hidden className="size-3.5 text-success" />
          {invite.payment === "received" ? "Received by the reporter" : "Released — waiting for the reporter to confirm"}
          {invite.paymentRef && <span className="font-semibold text-ink-2">· Ref {invite.paymentRef}</span>}
        </p>
      )}

      <StoryReview
        meetId={meet.id}
        invite={reading ? invite : null}
        onOpenChange={setReading}
        actions={
          invite.review === "pending" ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setReading(false);
                  setChangesOpen(true);
                }}
                leftIcon={<MessageSquareWarning aria-hidden />}
              >
                Ask for changes
              </Button>
              <Button onClick={() => review.mutate(true)} loading={review.isPending && review.variables === true} leftIcon={<BadgeCheck aria-hidden />}>
                Verify &amp; publish
              </Button>
            </>
          ) : undefined
        }
      />

      <Modal
        open={changesOpen}
        onOpenChange={setChangesOpen}
        title="Ask for changes"
        description={`Tell ${invite.reporter.name} what to fix. They'll update their story and send it again.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setChangesOpen(false)}>
              Back
            </Button>
            <Button
              onClick={() => {
                if (!note.trim()) {
                  setNoteError("Tell the reporter what to change");
                  return;
                }
                review.mutate(false);
              }}
              loading={review.isPending && review.variables === false}
              leftIcon={<Send aria-hidden />}
            >
              Send to reporter
            </Button>
          </>
        }
      >
        <Field label="What should change?" error={noteError}>
          <Textarea
            value={note}
            maxLength={PRESS_MEET.noteMax}
            rows={4}
            autoGrow
            placeholder="e.g. Please add the minister's full quote on the budget figures."
            onChange={(event) => {
              setNote(event.target.value);
              if (noteError) setNoteError(null);
            }}
          />
        </Field>
      </Modal>

      <Modal
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title={`Release ${inr(invite.price)}`}
        description={`Pay ${invite.reporter.name} directly (UPI or bank transfer), then record it here. They'll be asked to confirm they received it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReleaseOpen(false)}>
              Back
            </Button>
            <Button onClick={() => release.mutate()} loading={release.isPending} leftIcon={<Wallet aria-hidden />}>
              I&rsquo;ve paid — release
            </Button>
          </>
        }
      >
        <Field label="Payment reference" hint="UPI transaction ID or bank reference (optional, shown to the reporter).">
          <Input value={reference} maxLength={PRESS_MEET.referenceMax} placeholder="e.g. 427813902456" onChange={(event) => setReference(event.target.value)} />
        </Field>
      </Modal>
    </li>
  );
}
