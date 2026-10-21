"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import { StoryPoster } from "@/components/poster/story-poster";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/ui/time-ago";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { PressMeetInvite } from "@/lib/shared/contracts";

export type StoryReviewProps = {
  meetId: string;
  /** The invitation whose story is open (null = closed). */
  invite: PressMeetInvite | null;
  onOpenChange: (open: boolean) => void;
  /** Verify / Ask for changes, in the footer (while it waits for the organizer). */
  actions?: ReactNode;
};

/**
 * The organizer reads a reporter's story before verifying it (owner 2026-10-07: it isn't public until they do): the
 * article's image or video, the headline, the byline, the story and its reel poster — as readers will see it.
 */
export function StoryReview({ meetId, invite, onOpenChange, actions }: StoryReviewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={invite !== null}
      onOpenChange={onOpenChange}
      title={invite?.article?.title ?? "Story"}
      hideHeader
      size="lg"
      initialFocus={closeRef}
      footer={
        <>
          <Button ref={closeRef} variant="ghost" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            Close
          </Button>
          {actions}
        </>
      }
      bodyClassName="px-0 py-0 sm:px-0"
    >
      {invite && <StoryBody meetId={meetId} invite={invite} />}
    </Modal>
  );
}

function StoryBody({ meetId, invite }: { meetId: string; invite: PressMeetInvite }) {
  const { data: story, error, isPending } = useQuery({
    queryKey: qk.pressMeetStory(meetId, invite.id),
    queryFn: ({ signal }) => api.pressMeets.story(meetId, invite.id, signal),
  });

  return (
    <article className="flex flex-col">
      <div
        className="relative aspect-video w-full overflow-hidden bg-surface-2 bg-cover bg-center"
        style={story?.articleImageBlur ? { backgroundImage: `url("${story.articleImageBlur}")` } : undefined}
      >
        {story?.articleVideoUrl ? (
          <video src={story.articleVideoUrl} poster={story.articleImageUrl ?? undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-ink object-contain" />
        ) : story?.articleImageUrl ? (
          <img src={story.articleImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          (story?.coverUrl ?? invite.article?.coverUrl) && (
            <img src={story?.coverUrl ?? invite.article?.coverUrl ?? ""} alt="" className="absolute inset-0 size-full object-cover" />
          )
        )}
      </div>
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-8">
        <div className="flex items-start gap-5">
          <h2 className="min-w-0 flex-1 font-wide text-2xl font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[1.875rem]">
            {story?.title ?? invite.article?.title ?? "Untitled story"}
          </h2>
          {story && (
            <figure className="w-20 shrink-0 sm:w-24" aria-hidden>
              <StoryPoster
                template={story.template}
                story={{
                  title: story.title,
                  imageUrl: story.coverUrl ?? "",
                  imageBlur: story.coverBlur,
                  videoUrl: null,
                  imageFrame: story.posterFrame,
                  author: { ...story.author },
                }}
                className="rounded-lg ring-1 ring-border"
              />
            </figure>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar src={invite.reporter.image} name={invite.reporter.name} size={32} decorative />
            <span className="truncate text-sm font-bold text-ink">{invite.reporter.name}</span>
          </span>
          {invite.submittedAt && (
            <p className="text-xs text-muted">
              Sent <TimeAgo date={invite.submittedAt} />
            </p>
          )}
        </div>

        {isPending ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <SkeletonText lines={4} />
            <SkeletonText lines={3} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm font-semibold text-brand-strong">
            {errorMessage(error, "The story didn't load.")}
          </p>
        ) : story?.bodyHtml ? (
          // Sanitized on the server (sanitize-html allowlist, SPEC §5.6) — same as the article page.
          <div className="prose-news" dangerouslySetInnerHTML={{ __html: story.bodyHtml }} />
        ) : (
          <p className="text-sm italic text-muted">No story text.</p>
        )}
      </div>
    </article>
  );
}
