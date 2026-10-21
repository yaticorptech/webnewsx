"use client";

import { Check, Eye, Stamp, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { handleText } from "@/components/brand/user-handle";
import { reporterTypeLabel } from "@/components/presspass/press-format";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { TRAINEE_APPROVALS_TO_VERIFY, type AdminStoryRow, type Page } from "@/lib/shared/contracts";
import { ActionDialog } from "./action-dialog";
import { ApprovalsMeter } from "./approvals-meter";
import { LevelChip, StoryStatusChip } from "./chips";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore } from "./list-parts";
import { PersonCell } from "./person";
import { SectionHeader } from "./section-header";
import { DeskPoster, StoryPreview } from "./story-preview";
import { StorySummary } from "./story-summary";
import { StoryThumb } from "./story-thumb";
import { useDeskAction } from "./use-desk-action";
import { patchLists, useDeskList } from "./use-desk-list";

type Decision = { kind: "approve" | "return"; story: AdminStoryRow };

/** Review Desk (SPEC §3.11): Trainee stories wait here (oldest first) until the desk approves or returns them. */
export function ReviewView({ initial }: { initial: Page<AdminStoryRow> | null }) {
  const list = useDeskList({
    queryKey: qk.adminReview,
    fetchPage: (cursor, signal) => api.admin.reviewQueue(cursor, signal),
    initial,
  });
  const [preview, setPreview] = useState<AdminStoryRow | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);


  const approve = useDeskAction({
    run: ({ story, note }: { story: AdminStoryRow; note: string }) => api.admin.approve(story.id, note || undefined),
    optimistic: (client, { story }) => patchLists<AdminStoryRow>(client, qk.adminReview, (s) => s.id === story.id, () => null),
    success: (result, { story }) => ({
      title: "Approved — the story is live",
      description: result.autoVerified
        ? `${handleText(story.author.username)} just earned the Verified badge (${TRAINEE_APPROVALS_TO_VERIFY} approved stories).`
        : `“${story.title ?? "Untitled"}” is in every feed now.`,
    }),
    errorTitle: "Couldn't approve the story",
  });

  const returnStory = useDeskAction({
    run: ({ story, note }: { story: AdminStoryRow; note: string }) => api.admin.returnStory(story.id, note),
    optimistic: (client, { story }) => patchLists<AdminStoryRow>(client, qk.adminReview, (s) => s.id === story.id, () => null),
    success: (_result, { story }) => ({
      title: "Returned to the reporter",
      description: `${handleText(story.author.username)} sees your note in the composer.`,
    }),
    errorTitle: "Couldn't return the story",
  });

  const items = list.items;
  const willVerify = decision?.kind === "approve" && (decision.story.author.approvedCount ?? 0) + 1 >= TRAINEE_APPROVALS_TO_VERIFY;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Review Desk"
        description={`Stories from Trainee reporters wait here, oldest first. Approve to publish instantly, or return with a note. After ${TRAINEE_APPROVALS_TO_VERIFY} approved stories a Trainee becomes Verified.`}
      />
      <LiveCount>{list.isSuccess ? `${items.length} ${items.length === 1 ? "story" : "stories"} waiting` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading the Review Desk" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="The review queue didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty
          icon={<Stamp aria-hidden />}
          title="The Review Desk is clear"
          description="New stories from Trainee reporters will appear here the moment they're submitted."
        />
      ) : (
        <ol className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {items.map((story, i) => (
              <ReviewCard
                key={story.id}
                story={story}
                index={i}
                onPreview={() => setPreview(story)}
                onDecide={(kind) => setDecision({ kind, story })}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />

      <StoryPreview
        story={preview}
        onOpenChange={(open) => !open && setPreview(null)}
        actions={
          preview && (
            <>
              <Button
                variant="secondary"
                leftIcon={<Undo2 aria-hidden />}
                onClick={() => {
                  setDecision({ kind: "return", story: preview });
                  setPreview(null);
                }}
              >
                Return with note
              </Button>
              <Button
                leftIcon={<Check aria-hidden />}
                onClick={() => {
                  setDecision({ kind: "approve", story: preview });
                  setPreview(null);
                }}
              >
                Approve
              </Button>
            </>
          )
        }
      />

      <ActionDialog
        open={decision?.kind === "approve"}
        onOpenChange={(open) => !open && setDecision(null)}
        title="Approve and publish?"
        description="The story goes live right away and appears in every open feed."
        confirmLabel="Approve & publish"
        confirmIcon={<Check aria-hidden />}
        note={{ label: "Note to the reporter", placeholder: "Optional — e.g. what they did well", maxLength: 1000 }}
        onConfirm={async (note) => {
          if (decision) await approve.mutateAsync({ story: decision.story, note });
        }}
      >
        {decision && (
          <DecisionSummary story={decision.story}>
            {willVerify && (
              <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-xs font-bold text-success-strong">
                This is their final approval — they&apos;ll become a Verified Reporter.
              </p>
            )}
          </DecisionSummary>
        )}
      </ActionDialog>

      <ActionDialog
        open={decision?.kind === "return"}
        onOpenChange={(open) => !open && setDecision(null)}
        title="Return to the reporter"
        description="The story goes back to their drafts with your note shown in the composer."
        confirmLabel="Return story"
        confirmIcon={<Undo2 aria-hidden />}
        note={{
          label: "What should they fix?",
          placeholder: "Be specific: missing sources, unclear facts, headline…",
          required: true,
          requiredMessage: "Tell the reporter what to fix",
          maxLength: 1000,
        }}
        onConfirm={async (note) => {
          if (decision) await returnStory.mutateAsync({ story: decision.story, note });
        }}
      >
        {decision && <DecisionSummary story={decision.story} />}
      </ActionDialog>
    </div>
  );
}

function DecisionSummary({ story, children }: { story: AdminStoryRow; children?: ReactNode }) {
  return (
    <div>
      <StorySummary story={story} />
      {children}
    </div>
  );
}

type ReviewCardProps = {
  story: AdminStoryRow;
  index: number;
  onPreview: () => void;
  onDecide: (kind: Decision["kind"]) => void;
};

function ReviewCard({ story, index, onPreview, onDecide }: ReviewCardProps) {
  const titleId = useId();
  const background = reporterTypeLabel(story.author);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: Math.min(index, 8) * 0.05, ease: [0.2, 0.8, 0.2, 1] } }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.22 } }}
    >
      <article aria-labelledby={titleId} className="card group/card flex flex-col overflow-hidden sm:flex-row">
        <button
          type="button"
          onClick={onPreview}
          aria-label={`Preview “${story.title ?? "Untitled story"}”`}
          className="relative block shrink-0 overflow-hidden sm:w-60 lg:w-72"
        >
          <StoryThumb
            src={story.coverUrl}
            blur={story.coverBlur}
            className="aspect-video h-full w-full rounded-none transition-transform duration-500 ease-out-expo group-hover/card:scale-[1.03] motion-reduce:group-hover/card:scale-100 sm:aspect-auto sm:min-h-44"
          />
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-bold text-ink shadow-card">
            <Eye aria-hidden className="size-3.5 text-brand" />
            Preview
          </span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <StoryStatusChip status={story.status} />
                <span>
                  Submitted <TimeAgo date={story.submittedAt ?? story.updatedAt} />
                </span>
              </div>
              <h2 id={titleId} className="font-wide text-lg font-extrabold leading-snug tracking-[-0.01em] text-ink sm:text-xl">
                {story.title || "Untitled story"}
              </h2>
              {story.excerpt && <p className="line-clamp-2 text-sm leading-relaxed text-muted">{story.excerpt}</p>}
            </div>
            {/* The poster the reporter chose, as the reel will show it once approved. */}
            <DeskPoster story={story} className="w-20 sm:w-24" />
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <PersonCell person={story.author} size="sm" detail={background ?? undefined} />
            <span className="flex flex-wrap items-center gap-3">
              <LevelChip level={story.author.reporterLevel} />
              <ApprovalsMeter approved={story.author.approvedCount ?? 0} />
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Eye aria-hidden />} onClick={onPreview} aria-describedby={titleId} className="max-sm:hidden">
              Preview
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<Undo2 aria-hidden />} onClick={() => onDecide("return")} aria-describedby={titleId}>
              Return with note
            </Button>
            <Button size="sm" leftIcon={<Check aria-hidden />} onClick={() => onDecide("approve")} aria-describedby={titleId}>
              Approve
            </Button>
          </div>
        </div>
      </article>
    </motion.li>
  );
}
