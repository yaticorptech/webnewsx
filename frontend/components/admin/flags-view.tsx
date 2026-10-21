"use client";

import { Ban, Check, EyeOff, Flag, MessageSquareWarning, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  FLAG_REASON_VALUES,
  REPORT_RULES,
  type AdminFlagGroup,
  type AdminFlagsStatus,
  type FlagResolution,
  type FlagResolutionAction,
  type Page,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";
import { Chip, FlagReasonChip, StoryStatusChip } from "./chips";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore, Segmented } from "./list-parts";
import { deskStoryHref } from "./nav";
import { PersonCell } from "./person";
import { SectionHeader } from "./section-header";
import { StoryThumb } from "./story-thumb";
import { useDeskAction } from "./use-desk-action";
import { patchLists, useDeskList } from "./use-desk-list";
import { useUndo } from "./use-story-actions";

const RESOLUTION_LABEL: Record<FlagResolution, string> = {
  dismissed: "Dismissed",
  hidden: "Story hidden",
  warned: "Reporter warned",
  suspended: "Reporter suspended",
};

type ActionCopy = {
  label: string;
  icon: ReactNode;
  title: string;
  description: string;
  confirm: string;
  note: { label: string; placeholder: string };
  done: string;
};

/** What an editor can do from a reported story's card: resolve its reports, or delete the story outright. */
type CardAction = FlagResolutionAction | "delete";

const ACTIONS: Record<CardAction, ActionCopy> = {
  dismiss: {
    label: "Dismiss",
    icon: <Check aria-hidden />,
    title: "Dismiss these reports?",
    description: "The story stays up and every open report on it is closed.",
    confirm: "Dismiss reports",
    note: { label: "Note for the audit log", placeholder: "Optional — why the story is fine" },
    done: "Reports dismissed",
  },
  hide: {
    label: "Hide story",
    icon: <EyeOff aria-hidden />,
    title: "Hide the story and close the reports?",
    description: "It disappears from every public feed at once. The reporter is notified (banner + Newsroom) and still sees it, marked hidden.",
    confirm: "Hide story",
    note: { label: "Reason (sent to the reporter)", placeholder: "Optional — defaults to “Hidden after reader reports”" },
    done: "Story hidden",
  },
  warn: {
    label: "Warn reporter",
    icon: <MessageSquareWarning aria-hidden />,
    title: "Warn the reporter?",
    description:
      "The story stays up. The reporter gets the warning at once — a red banner on every page until they acknowledge it, and in their Newsroom — and it's kept in the audit log.",
    confirm: "Send warning",
    note: { label: "Message to the reporter", placeholder: "What was wrong and what they must not do again" },
    done: "Warning sent to the reporter",
  },
  suspend: {
    label: "Suspend reporter",
    icon: <Ban aria-hidden />,
    title: "Suspend the reporter?",
    description: "They're signed out everywhere, can't sign in, and all their stories leave the public feeds until the suspension is lifted.",
    confirm: "Suspend reporter",
    note: { label: "Reason (shown to them at sign-in)", placeholder: "Optional — defaults to “Suspended after reader reports”" },
    done: "Reporter suspended",
  },
  delete: {
    label: "Delete story",
    icon: <Trash2 aria-hidden />,
    title: "Delete the story for good?",
    description: "The story and every report on it are removed permanently. This can't be undone.",
    confirm: "Delete story",
    note: { label: "Reason (for the audit log)", placeholder: "Optional — why it was removed" },
    done: "Story deleted",
  },
};

const AUTO_RULES_NOTE = `Every report warns the story's reporter automatically; from ${REPORT_RULES.reviewAt} open reports a story needs your decision (marked below and counted on the Flags badge). Nothing is hidden automatically.`;

/** Flags (SPEC §3.11): reader reports grouped by story; one decision resolves every open report on it. */
export function FlagsView({ initial }: { initial: Page<AdminFlagGroup> | null }) {
  const [status, setStatus] = useState<AdminFlagsStatus>("open");
  const list = useDeskList({
    queryKey: qk.adminFlags(status),
    fetchPage: (cursor, signal) => api.admin.flags(status, cursor, signal),
    initial: status === "open" ? initial : null,
  });
  const undo = useUndo();
  const [pending, setPending] = useState<{ action: CardAction; group: AdminFlagGroup } | null>(null);

  const resolve = useDeskAction({
    run: ({ group, action, note }: { group: AdminFlagGroup; action: FlagResolutionAction; note: string }) =>
      api.admin.resolveFlags(group.article.id, action, note || undefined),
    optimistic: (client, { group }) =>
      patchLists<AdminFlagGroup>(client, qk.adminFlags("open"), (g) => g.article.id === group.article.id, () => null),
    success: (result, { group, action }) => ({
      title: ACTIONS[action].done,
      description: `${result.resolved} report${result.resolved === 1 ? "" : "s"} on “${group.article.title ?? "Untitled story"}” resolved.`,
      action:
        action === "hide"
          ? { label: "Unhide", onClick: () => void undo(() => api.admin.unhide(group.article.id), "Story visible again") }
          : action === "suspend"
            ? { label: "Lift suspension", onClick: () => void undo(() => api.admin.unsuspend(group.article.author.id), "Suspension lifted") }
            : undefined,
    }),
    errorTitle: "Couldn't resolve the reports",
  });

  const remove = useDeskAction({
    run: ({ group, note }: { group: AdminFlagGroup; note: string }) => api.admin.deleteStory(group.article.id, note || undefined),
    optimistic: (client, { group }) =>
      patchLists<AdminFlagGroup>(client, qk.adminFlags("open"), (g) => g.article.id === group.article.id, () => null),
    success: (_result, { group }) => ({
      title: ACTIONS.delete.done,
      description: `“${group.article.title ?? "Untitled story"}” and its reports are gone for good.`,
    }),
    errorTitle: "Couldn't delete the story",
  });

  const items = list.items;
  const copy = pending ? ACTIONS[pending.action] : null;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Flags"
        description={`Reader reports, grouped by story. One decision resolves every open report on a story: dismiss, hide the story, warn the reporter or suspend them. ${AUTO_RULES_NOTE}`}
      />
      <Segmented
        label="Report status"
        options={[
          { value: "open", label: "Open" },
          { value: "resolved", label: "Resolved" },
        ]}
        value={status}
        onChange={setStatus}
      />
      <LiveCount>{list.isSuccess ? `${items.length} reported ${items.length === 1 ? "story" : "stories"}` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading reports" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="The reports didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty
          icon={<Flag aria-hidden />}
          title={status === "open" ? "No open reports" : "Nothing resolved yet"}
          description={status === "open" ? "When readers flag a story it lands here, grouped with every other report on it." : "Resolved reports are kept here for reference."}
        />
      ) : (
        <ol className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {items.map((group, i) => (
              <FlagGroupCard key={group.article.id} group={group} index={i} open={status === "open"} onAction={(action) => setPending({ action, group })} />
            ))}
          </AnimatePresence>
        </ol>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />

      <ActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={copy?.title ?? ""}
        description={copy?.description}
        confirmLabel={copy?.confirm ?? "Confirm"}
        confirmIcon={copy?.icon}
        note={copy ? { ...copy.note, maxLength: 1000 } : undefined}
        onConfirm={async (note) => {
          if (!pending) return;
          if (pending.action === "delete") await remove.mutateAsync({ group: pending.group, note });
          else await resolve.mutateAsync({ group: pending.group, action: pending.action, note });
        }}
      >
        {pending && (
          <div className="flex gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
            <StoryThumb src={pending.group.article.coverUrl} className="w-20" />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{pending.group.article.title || "Untitled story"}</p>
              <p className="mt-1 text-xs text-muted">
                by <UserHandle username={pending.group.article.author.username} /> · {pending.group.openCount} open report{pending.group.openCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        )}
      </ActionDialog>
    </div>
  );
}

const SHOWN = 3;

function FlagGroupCard({ group, index, open, onAction }: { group: AdminFlagGroup; index: number; open: boolean; onAction: (action: CardAction) => void }) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const { article } = group;
  const flags = expanded ? group.flags : group.flags.slice(0, SHOWN);
  const hideable = article.status === "published";
  const reasons = FLAG_REASON_VALUES.filter((reason) => (group.reasons[reason] ?? 0) > 0);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: Math.min(index, 8) * 0.05, ease: [0.2, 0.8, 0.2, 1] } }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.22 } }}
    >
      {/* Needs a decision (REPORT_RULES.reviewAt+ open reports): outlined in red. */}
      <article aria-labelledby={titleId} className={cn("card overflow-hidden", open && group.needsDecision && "ring-2 ring-brand")}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <StoryThumb src={article.coverUrl} className="w-full rounded-xl sm:w-44" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StoryStatusChip status={article.status} />
              {open ? (
                <Chip tone="solid" icon={<Flag aria-hidden />}>
                  {group.openCount} open
                </Chip>
              ) : (
                <Chip tone="muted">{group.totalCount} resolved</Chip>
              )}
              {open && group.needsDecision && (
                <Chip tone="brand" icon={<MessageSquareWarning aria-hidden />}>
                  Needs decision
                </Chip>
              )}
              <span className="text-xs text-muted">
                Latest report <TimeAgo date={group.latestAt} />
              </span>
            </div>

            <h2 id={titleId} className="font-wide text-lg font-extrabold leading-snug tracking-[-0.01em] text-ink">
              {article.slug && article.status === "published" ? (
                <Link href={deskStoryHref(article.title)} className="hover:text-brand">
                  {article.title || "Untitled story"}
                </Link>
              ) : (
                article.title || "Untitled story"
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <PersonCell person={article.author} size="sm" />
              {article.author.suspended && <Chip tone="solid">Suspended</Chip>}
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Reasons">
              {reasons.map((reason) => (
                <FlagReasonChip key={reason} reason={reason} count={group.reasons[reason]} />
              ))}
            </div>
          </div>
        </div>

        <ul className="divide-y divide-border border-t border-border bg-surface-2/40">
          {flags.map((flag) => (
            <li key={flag.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
              <div className="flex shrink-0 items-center gap-2 sm:w-44">
                <FlagReasonChip reason={flag.reason} />
              </div>
              <p className={cn("min-w-0 flex-1 text-sm leading-snug wrap-anywhere", flag.note ? "text-ink-2" : "italic text-muted")}>
                {flag.note ? `“${flag.note}”` : "No note"}
              </p>
              <p className="shrink-0 text-xs text-muted">
                {flag.by.username ? <UserHandle username={flag.by.username} /> : flag.by.name} · <TimeAgo date={flag.createdAt} />
                {flag.resolution && <span className="font-semibold text-ink-2"> · {RESOLUTION_LABEL[flag.resolution]}</span>}
              </p>
            </li>
          ))}
          {group.flags.length > SHOWN && (
            <li className="px-4 py-2 sm:px-5">
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-xs font-bold text-brand hover:text-brand-hover">
                {expanded ? "Show fewer" : `Show all ${group.flags.length} reports`}
              </button>
            </li>
          )}
        </ul>

        {open && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            <Button variant="ghost" size="sm" leftIcon={ACTIONS.dismiss.icon} onClick={() => onAction("dismiss")} aria-describedby={titleId}>
              Dismiss
            </Button>
            <Button variant="outline" size="sm" leftIcon={ACTIONS.warn.icon} onClick={() => onAction("warn")} aria-describedby={titleId}>
              Warn reporter
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={ACTIONS.suspend.icon}
              onClick={() => onAction("suspend")}
              disabled={article.author.suspended}
              aria-describedby={titleId}
            >
              Suspend reporter
            </Button>
            <Button variant="outline" size="sm" leftIcon={ACTIONS.delete.icon} onClick={() => onAction("delete")} aria-describedby={titleId}>
              Delete story
            </Button>
            <Button size="sm" leftIcon={ACTIONS.hide.icon} onClick={() => onAction("hide")} disabled={!hideable} aria-describedby={titleId}>
              Hide story
            </Button>
          </div>
        )}
      </article>
    </motion.li>
  );
}
