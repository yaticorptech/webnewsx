import { ArrowRight, BadgeCheck, IdCard, Plus } from "lucide-react";
import Link from "next/link";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { TraineeChip } from "@/components/feed/story-badges";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CoverBand } from "@/components/ui/cover-band";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TRAINEE_APPROVALS_TO_VERIFY, type PressPassSummary, type ViewerUser } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type NewsroomHeaderProps = {
  viewer: Pick<ViewerUser, "name" | "username" | "image" | "role" | "reporterLevel">;
  pass: PressPassSummary | null;
};

/**
 * Newsroom masthead (redesign 2026-10-07, like a creator dashboard): the red cover band with the "Newsroom" label, the
 * reporter's portrait over its edge, name + Verified badge (or the Trainee progress meter — three icon bars that fill
 * as stories are approved), handle · role · pass number, and the two actions a reporter reaches for: "+ New story" and
 * their Press Pass.
 */
export function NewsroomHeader({ viewer, pass }: NewsroomHeaderProps) {
  const level = pass?.status === "active" ? pass.level : viewer.reporterLevel;
  const verified = level === "verified" || (viewer.role === "admin" && !pass);
  const roleLine = viewer.role === "admin" ? "Editor Desk" : level === "trainee" ? "Trainee reporter" : "Verified reporter";

  return (
    <header className="overflow-hidden rounded-3xl border border-border bg-surface">
      <CoverBand className="h-24 sm:h-32">
        <p className="absolute left-5 top-4 inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white sm:left-8 sm:top-5">
          <PulseDot size="xs" tone="white" />
          Newsroom
        </p>
      </CoverBand>
      <div className="px-5 pb-6 sm:px-8 sm:pb-7">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-end gap-4">
            <Avatar src={viewer.image} name={viewer.name} size={84} decorative priority className="-mt-10 shrink-0 ring-4 ring-surface sm:-mt-12" />
            <div className="min-w-0 pb-1">
              <h1
                id="newsroom-heading"
                className="font-wide text-[clamp(1.375rem,1.15rem+1vw,1.875rem)] font-black leading-[1.08] tracking-[-0.02em] text-ink wrap-anywhere"
              >
                {viewer.name}
                {verified && (
                  <>
                    {" "}
                    <VerifiedBadge
                      size={22}
                      label={viewer.role === "admin" ? "Editor Desk" : "Verified"}
                      className="align-[-0.12em]"
                    />
                  </>
                )}
                {level === "trainee" && <TraineeChip className="ml-2 align-middle" />}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] font-semibold text-muted">
                {viewer.username && <UserHandle username={viewer.username} className="text-ink-2" />}
                <span aria-hidden>·</span>
                <span>{roleLine}</span>
                {pass && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono text-xs tracking-wide text-ink-2" title="Press Pass number">
                      {pass.passNumber}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button href="/publish" leftIcon={<Plus aria-hidden />}>
              New story
            </Button>
            <Button href="/press-pass" variant="secondary" leftIcon={<IdCard aria-hidden />}>
              Press Pass
            </Button>
          </div>
        </div>

        {level === "trainee" && pass && <TraineeProgress approved={pass.approvedCount} />}

        <p className="mt-5 max-w-lg text-sm leading-relaxed text-ink-2">
          How your reporting is landing: who read it, what they liked and shared, and when your readers are online.
        </p>
      </div>
    </header>
  );
}

/** Three icon bars, one per approved story, filling in red towards Verified. */
function TraineeProgress({ approved }: { approved: number }) {
  const done = Math.min(approved, TRAINEE_APPROVALS_TO_VERIFY);
  const left = TRAINEE_APPROVALS_TO_VERIFY - done;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-tint-border bg-surface px-4 py-3">
      <div
        role="meter"
        aria-label="Stories approved towards Verified"
        aria-valuemin={0}
        aria-valuemax={TRAINEE_APPROVALS_TO_VERIFY}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${TRAINEE_APPROVALS_TO_VERIFY} approved`}
        className="flex items-center gap-1"
      >
        {Array.from({ length: TRAINEE_APPROVALS_TO_VERIFY }, (_, i) => (
          <span
            key={i}
            className={cn("h-3 w-9 slant [--slant-x:0.35rem]", i < done ? "bg-brand" : "bg-tint-3")}
          />
        ))}
      </div>
      <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-2">
        <strong className="font-bold text-ink">
          {done} of {TRAINEE_APPROVALS_TO_VERIFY} stories approved.
        </strong>{" "}
        {left > 0
          ? `${left} more approved ${left === 1 ? "story" : "stories"} and you're Verified — you'll publish instantly.`
          : "Verification is on its way."}
      </p>
      <BadgeCheck aria-hidden className="hidden size-5 shrink-0 text-brand sm:block" />
    </div>
  );
}

/** Banner for incomplete passes: migrated without region / pledge, or issued before verification (SPEC §3.11). */
export function CompletePassBanner() {
  return (
    <Link
      href="/press-pass"
      className="group flex items-center gap-4 rounded-2xl border border-brand bg-surface px-5 py-4 shadow-card transition-colors hover:bg-tint"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast">
        <IdCard aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-wide text-[0.9375rem] font-extrabold text-ink">Complete your Press Pass</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
          Add your personal and verification details so the Editor Desk can confirm who you are.
        </span>
      </span>
      <ArrowRight aria-hidden className="size-5 shrink-0 text-brand transition-transform duration-200 ease-snap group-hover:translate-x-1" />
    </Link>
  );
}
