"use client";

import { EyeOff, Flag, Lock } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeAgo } from "@/components/ui/time-ago";
import { FLAG_REASON_LABELS, type ReportedStory } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * The owner's "Reported" section (owner 2026-09-28): each of their stories that readers reported — how many times and
 * why (reasons + the readers' notes, never who) — and what happened: still live (waiting for the Editor Desk), hidden
 * by the desk, or — before 2026-09-30's rules — hidden for good after many reports (it can't be published again).
 */
export function ReportedList({ items }: { items: ReportedStory[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Flag aria-hidden />}
        kicker="Reported"
        title="None of your stories has been reported"
        description="When a reader reports one of your stories, you'll see why here — and in your notifications."
      />
    );
  }
  return (
    <ul aria-label="Your reported stories" className="flex flex-col gap-3">
      {items.map((story) => (
        <li key={story.id}>
          <ReportedCard story={story} />
        </li>
      ))}
    </ul>
  );
}

function ReportedCard({ story }: { story: ReportedStory }) {
  return (
    <article
      className={cn(
        "flex gap-3 rounded-2xl border bg-surface p-3 sm:gap-4 sm:p-4",
        story.locked ? "border-brand/40 shadow-[inset_3px_0_0_var(--brand)]" : "border-border",
      )}
      data-testid="reported-story"
    >
      <div
        className="relative size-18 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:size-24"
        style={story.coverBlur ? { backgroundImage: `url("${story.coverBlur}")`, backgroundSize: "cover" } : undefined}
      >
        {story.coverUrl && (
          <img src={story.coverUrl} alt="" loading="lazy" decoding="async" className={cn("size-full object-cover", story.hidden && "grayscale")} />
        )}
        {story.hidden && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-white">
            <EyeOff aria-hidden className="size-5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Status story={story} />
        <h3 className="mt-1.5 line-clamp-2 text-[0.9375rem] font-bold leading-snug text-ink wrap-anywhere">
          {story.slug ? (
            <Link href={`/a/${story.slug}`} className="hover:text-brand">
              {story.title}
            </Link>
          ) : (
            story.title
          )}
        </h3>
        <p className="mt-1 text-xs font-medium text-muted">
          Reported {story.reports} {story.reports === 1 ? "time" : "times"} · last <TimeAgo date={story.lastReportedAt} />
        </p>

        <ul aria-label="Reasons" className="mt-2 flex flex-wrap gap-1.5">
          {story.reasons.map((r) => (
            <li
              key={r.reason}
              className="inline-flex items-center gap-1 rounded-full border border-tint-border bg-tint px-2.5 py-1 text-xs font-bold leading-none text-brand"
            >
              {FLAG_REASON_LABELS[r.reason]}
              <span className="tabular-nums text-brand/70">×{r.count}</span>
            </li>
          ))}
        </ul>

        {story.notes.length > 0 && (
          <ul aria-label="What readers said" className="mt-2.5 flex flex-col gap-1.5">
            {story.notes.map((note, i) => (
              <li key={i} className="border-l-2 border-border-strong pl-2.5 text-[0.8125rem] italic leading-snug text-ink-2 wrap-anywhere">
                &ldquo;{note}&rdquo;
              </li>
            ))}
          </ul>
        )}

        {story.locked && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-tint px-3 py-2 text-[0.8125rem] font-semibold leading-snug text-brand-strong">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            Many readers reported this story, so it was hidden from everyone and can&rsquo;t be published again.
          </p>
        )}
        {!story.locked && story.hidden && story.hiddenReason && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[0.8125rem] leading-snug text-ink-2">
            <span className="font-bold">Editor Desk:</span> {story.hiddenReason}
          </p>
        )}
      </div>
    </article>
  );
}

function Status({ story }: { story: ReportedStory }) {
  const [label, tone] = story.locked
    ? ["Hidden for good", "bg-brand text-brand-contrast"]
    : story.hidden
      ? ["Hidden by the Editor Desk", "bg-ink text-white"]
      : ["Still live", "border border-border-strong bg-surface text-ink-2"];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em]", tone)}>
      {label}
    </span>
  );
}
