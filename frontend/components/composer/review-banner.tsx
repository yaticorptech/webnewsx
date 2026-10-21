"use client";

import { Clock3, GraduationCap, MessageSquareWarning } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ArticleReview } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type ReviewBannerProps = {
  /** Review Desk state of this story (null = never submitted / withdrawn). */
  review: ArticleReview | null;
  /** The writer is a Trainee (their stories go to the Review Desk). */
  trainee: boolean;
  className?: string;
};

/**
 * Review Desk status at the top of the composer (SPEC §3.11):
 * - returned → the editor's note, quoted, with what to do next;
 * - in review → waiting for an editor (saving as a draft withdraws it, submitting again updates it);
 * - otherwise, for Trainees → a short note that stories are checked before they go live.
 */
export function ReviewBanner({ review, trainee, className }: ReviewBannerProps) {
  const reduce = useReducedMotion();
  const motionProps = reduce
    ? {}
    : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] as const } };

  if (review?.state === "returned") {
    return (
      <motion.section
        {...motionProps}
        role="region"
        aria-labelledby="review-returned-title"
        data-testid="review-banner"
        data-state="returned"
        className={cn("relative overflow-hidden rounded-2xl border border-brand/40 bg-tint-2", className)}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          <p id="review-returned-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
            <MessageSquareWarning aria-hidden className="size-4.5 text-brand" />
            Returned by the Review Desk
            {review.returnedAt && (
              <span className="font-medium text-muted">
                · <TimeAgo date={review.returnedAt} />
              </span>
            )}
          </p>
          {review.note && (
            <blockquote className="border-l-2 border-brand pl-3 font-serif text-[1.0625rem] italic leading-relaxed text-ink">
              <span className="sr-only">Editor&rsquo;s note: </span>
              {review.note}
            </blockquote>
          )}
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Make the changes, then <strong className="text-ink">Submit for review</strong> again from Preview.
          </p>
        </div>
      </motion.section>
    );
  }

  if (review?.state === "in_review") {
    return (
      <motion.section
        {...motionProps}
        role="region"
        aria-label="Review Desk status"
        data-testid="review-banner"
        data-state="in_review"
        className={cn("panel-tint flex items-start gap-3 px-5 py-4 sm:px-6", className)}
      >
        <span className="relative mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-tint-border bg-surface text-brand">
          <Clock3 aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-bold text-ink">
            In review
            {review.submittedAt && (
              <span className="font-medium text-muted">
                {" "}
                · submitted <TimeAgo date={review.submittedAt} />
              </span>
            )}
          </p>
          <p className="mt-0.5 text-muted">
            An editor at the Review Desk is checking this story — it goes live as soon as it&rsquo;s approved. Saving it as a
            draft withdraws it; submitting again sends your changes.
          </p>
        </div>
      </motion.section>
    );
  }

  if (!trainee) return null;
  return (
    <motion.p
      {...motionProps}
      data-testid="review-banner"
      data-state="trainee"
      className={cn("flex items-start gap-2.5 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-[0.8125rem] leading-relaxed text-muted", className)}
    >
      <GraduationCap aria-hidden className="mt-0.5 size-4.5 shrink-0 text-brand" />
      <span>
        <strong className="text-ink">Trainee reporter:</strong> your stories go to the Review Desk before they go live. Three
        approved stories make you Verified.{" "}
        <Link href="/press-pass" className="font-bold text-brand underline-offset-4 hover:underline">
          Your Press Pass
        </Link>
      </span>
    </motion.p>
  );
}
