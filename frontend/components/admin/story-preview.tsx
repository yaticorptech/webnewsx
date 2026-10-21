"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { StoryPoster, type PosterStory } from "@/components/poster/story-poster";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SkeletonText, Skeleton } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/ui/time-ago";
import { api, errorMessage } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { FLAG_REASON_LABELS, POSTER_TEMPLATE_LABELS, type AdminStoryRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { EditorsPickChip, SpotlightChip, StoryStatusChip } from "./chips";
import { PersonCell } from "./person";

type StoryPreviewProps = {
  /** The row being previewed (shown instantly while the full story loads). */
  story: AdminStoryRow | null;
  onOpenChange: (open: boolean) => void;
  /** Desk actions for this story (Approve / Return / Hide…), shown in the footer. */
  actions?: ReactNode;
};

/** Full read of a story inside the console (any status): cover (or video), reel poster, byline, body and reader reports. */
export function StoryPreview({ story, onOpenChange, actions }: StoryPreviewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={story !== null}
      onOpenChange={onOpenChange}
      title={story?.title || "Untitled story"}
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
      {story && <PreviewBody row={story} />}
    </Modal>
  );
}

function PreviewBody({ row }: { row: AdminStoryRow }) {
  const { data, error, isPending } = useQuery({
    queryKey: qk.adminStory(row.id),
    queryFn: ({ signal }) => api.admin.story(row.id, signal),
  });
  const story = data?.story;
  const flags = data?.flags ?? [];

  return (
    <article className="flex flex-col">
      {/* The full article's own media when it has one (the cover shows on the reel poster below), as readers see it. */}
      <div
        className="relative aspect-video w-full overflow-hidden bg-surface-2 bg-cover bg-center"
        style={(story?.articleImageBlur ?? row.coverBlur) ? { backgroundImage: `url("${story?.articleImageBlur ?? row.coverBlur}")` } : undefined}
      >
        {story?.articleImageUrl ? (
          story.articleVideoUrl ? (
            <video src={story.articleVideoUrl} poster={story.articleImageUrl} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-ink object-contain" />
          ) : (
            <img src={story.articleImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
          )
        ) : story?.videoUrl ? (
          // Video stories: the desk watches the clip itself (with sound and controls) before deciding.
          <video src={story.videoUrl} poster={row.coverUrl ?? undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-ink object-contain" />
        ) : (
          row.coverUrl && <img src={row.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-8">
        <div className="flex items-start gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StoryStatusChip status={row.status} />
              {row.editorsPick && <EditorsPickChip order={row.pinOrder} />}
              {row.spotlight && <SpotlightChip />}
            </div>
            <h2 className="font-wide text-2xl font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[1.875rem]">{row.title || "Untitled story"}</h2>
          </div>
          <DeskPoster story={row} className="w-20 sm:w-24" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
          <PersonCell person={row.author} />
          <p className="text-xs text-muted">
            {row.publishedAt ? "Published " : row.submittedAt ? "Submitted " : "Updated "}
            <TimeAgo date={row.publishedAt ?? row.submittedAt ?? row.updatedAt} />
            {row.status === "published" || row.status === "hidden" ? (
              <> · {pluralize(row.viewCount, "view")} · {pluralize(row.likeCount, "like")} · {pluralize(row.shareCount, "share")}</>
            ) : null}
          </p>
        </div>

        {row.hiddenReason && <Callout label="Hidden by the desk">{row.hiddenReason}</Callout>}
        {row.reviewNote && row.status !== "published" && <Callout label="Note to the reporter">{row.reviewNote}</Callout>}

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
          <p className="text-sm italic text-muted">No body text yet.</p>
        )}

        {flags.length > 0 && (
          <section aria-label="Reader reports" className="panel-tint flex flex-col gap-3 p-4">
            <p className="kicker text-brand-strong">Reader reports · {flags.length}</p>
            <ul className="flex flex-col gap-2.5">
              {flags.map((flag) => (
                <li key={flag.id} className="text-sm leading-snug text-ink-2">
                  <strong className="text-ink">{FLAG_REASON_LABELS[flag.reason]}</strong>
                  {flag.note ? <> — {flag.note}</> : null}
                  <span className="block text-xs text-muted">
                    {flag.by.username ? <UserHandle username={flag.by.username} /> : flag.by.name} · <TimeAgo date={flag.createdAt} />
                    {flag.status === "resolved" ? ` · ${flag.resolution ?? "resolved"}` : " · open"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

/** A desk row as its reel poster shows it (cover, headline, byline with the badge readers see). */
function posterStoryOf(row: AdminStoryRow): PosterStory {
  return {
    title: row.title || "Untitled story",
    imageUrl: row.coverUrl ?? "",
    imageBlur: row.coverBlur,
    imageFrame: row.posterFrame,
    author: {
      name: row.author.name,
      username: row.author.username,
      image: row.author.image,
      // Readers see Editor Desk accounts with the Verified badge (backend badgeLevelSql).
      reporterLevel: row.author.role === "admin" ? "verified" : row.author.reporterLevel,
    },
  };
}

/**
 * The story's reel poster as a small thumbnail (96px wide by default), in the template the reporter chose, with the
 * template's name under it. The poster itself is hidden from screen readers: its headline is already on screen.
 */
export function DeskPoster({ story, className }: { story: AdminStoryRow; className?: string }) {
  return (
    <figure className={cn("flex w-24 shrink-0 flex-col gap-1.5", className)}>
      <div aria-hidden>
        <StoryPoster template={story.template} story={posterStoryOf(story)} className="rounded-lg ring-1 ring-border" />
      </div>
      <figcaption className="truncate text-center text-[0.6875rem] font-semibold leading-tight text-muted">
        <span className="sr-only">Reel poster: </span>
        {POSTER_TEMPLATE_LABELS[story.template]}
      </figcaption>
    </figure>
  );
}

function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-4 border-brand bg-tint px-4 py-3">
      <p className="kicker text-brand-strong">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}
