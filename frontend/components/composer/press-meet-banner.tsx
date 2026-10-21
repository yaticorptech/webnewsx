"use client";

import { Clock3, Mic, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import type { ArticlePressMeet } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type PressMeetBannerProps = {
  meet: ArticlePressMeet;
  className?: string;
};

/**
 * A press meet story at the top of the composer (owner 2026-10-07): which press meet it's for and that its organizer
 * verifies it before it goes live — with their note when they asked for changes, or that it's waiting for them.
 */
export function PressMeetBanner({ meet, className }: PressMeetBannerProps) {
  const organizer = meet.organizer.name;
  const meetLink = (
    <Link href={`/press-meet/${meet.id}`} className="font-bold text-ink underline-offset-4 hover:text-brand hover:underline">
      {meet.title}
    </Link>
  );

  if (meet.review === "changes") {
    return (
      <section
        aria-label="Press meet organizer's note"
        className={cn("relative overflow-hidden rounded-2xl border border-brand/40 bg-tint-2", className)}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <MessageSquareWarning aria-hidden className="size-4.5 text-brand" />
            {organizer} asked for changes
          </p>
          {meet.reviewNote && (
            <blockquote className="border-l-2 border-brand pl-3 font-serif text-[1.0625rem] italic leading-relaxed text-ink">
              <span className="sr-only">Organizer&rsquo;s note: </span>
              {meet.reviewNote}
            </blockquote>
          )}
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Make the changes, then <strong className="text-ink">Send to organiser</strong> again from Preview. Press meet: {meetLink}
          </p>
        </div>
      </section>
    );
  }

  const waiting = meet.review === "pending";
  return (
    <section aria-label="Press meet story" className={cn("panel-tint flex items-start gap-3 px-5 py-4 sm:px-6", className)}>
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-tint-border bg-surface text-brand">
        {waiting ? <Clock3 aria-hidden className="size-4.5" /> : <Mic aria-hidden className="size-4.5" />}
      </span>
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-bold text-ink">{waiting ? `Waiting for ${organizer} to verify it` : "Your story for a press meet"}</p>
        <p className="mt-0.5 text-muted">
          For {meetLink}.{" "}
          {waiting
            ? "It goes live once they verify it. Saving it as a draft takes it back; sending it again sends your changes."
            : `When it's ready, send it to ${organizer} — it goes live on WebNEWS once they verify it, and can't be changed after that.`}
        </p>
      </div>
    </section>
  );
}
