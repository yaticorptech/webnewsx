"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleSlash, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { GROUP_ROLE_LABELS, type AdminGroupApplication, type GroupRole } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { deskPersonHref, deskStoryHref } from "./nav";
import { SectionHeader } from "./section-header";

/**
 * Desk → Group accounts (owner 2026-10-23): a Press Pass holder asks for an outlet account (e.g. VK Mangalore) that
 * several members post as. Approving makes the account, with its own Verified Press Pass, and the applicant its owner.
 */
export function GroupApplicationsView() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.adminGroups, queryFn: ({ signal }) => api.admin.groups(signal) });
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "approve" | "reject"; note?: string }) => api.admin.decideGroup(id, decision, note),
    onSuccess: (data, { decision }) => {
      queryClient.setQueryData(qk.adminGroups, data);
      toast.success(decision === "approve" ? "Group account created" : "Application turned down");
    },
    onError: (error) => toast.error("Couldn't save the decision", { description: errorMessage(error) }),
  });
  const items = query.data?.items ?? [];
  const pending = items.filter((a) => a.status === "pending");
  const decided = items.filter((a) => a.status !== "pending");

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Group accounts"
        description="Outlets that want one account run by several members. Check the details below, then approve — the group gets its own Verified Press Pass, covering its members."
      />
      {query.isPending ? (
        <div aria-hidden className="skeleton h-48 rounded-2xl" />
      ) : query.isError ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-muted">Couldn&rsquo;t load applications. {errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">Waiting ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="card px-5 py-5 text-sm text-muted">No applications waiting.</p>
            ) : (
              pending.map((app) => (
                <PendingCard
                  key={app.id}
                  app={app}
                  busy={decide.isPending && decide.variables?.id === app.id}
                  onDecide={(decision, note) => decide.mutate({ id: app.id, decision, note })}
                />
              ))
            )}
          </section>
          {decided.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink">Decided ({decided.length})</h2>
              {/* Cards (owner 2026-10-23: "show in card style"); an approved one opens its details. */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {decided.map((app) => (
                  <DecidedCard key={app.id} app={app} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PendingCard({ app, busy, onDecide }: { app: AdminGroupApplication; busy: boolean; onDecide: (decision: "approve" | "reject", note?: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <article className="card flex flex-col gap-4 px-5 py-5">
      <div className="flex items-start gap-4">
        <Avatar src={app.image} name={app.name} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">{app.name}</p>
          <p className="text-sm text-muted">@{app.username}</p>
          <p className="mt-1 text-sm text-ink-2">{app.about}</p>
        </div>
        <span className="shrink-0 text-xs text-muted">
          <TimeAgo date={app.createdAt} />
        </span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Applicant</dt>
          <dd className="mt-0.5">
            <Link href={deskPersonHref(app.applicant.username)} className="font-semibold text-ink hover:underline">
              {app.applicant.name}
            </Link>{" "}
            <span className="text-muted">@{app.applicant.username}</span>
            {app.applicant.passNumber && <span className="block text-xs text-muted">Press Pass {app.applicant.passNumber}</span>}
          </dd>
        </div>
        {app.link && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Website</dt>
            <dd className="mt-0.5">
              <a href={app.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                {app.link.replace(/^https?:\/\//, "")}
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </dd>
          </div>
        )}
      </dl>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Note to the applicant (optional — shown on their Groups page)" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy} leftIcon={<CircleSlash aria-hidden />} onClick={() => onDecide("reject", note.trim() || undefined)}>
          Turn down
        </Button>
        <Button size="sm" loading={busy} leftIcon={<CircleCheck aria-hidden />} onClick={() => onDecide("approve", note.trim() || undefined)}>
          Approve
        </Button>
      </div>
    </article>
  );
}

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const ROLE_TONE: Record<GroupRole, string> = {
  owner: "bg-ink text-surface",
  editor: "bg-tint text-brand",
  writer: "bg-surface-2 text-ink-2",
};

const STORY_STATUS: Record<"draft" | "in_review" | "published", string> = { draft: "Draft", in_review: "In review", published: "Live" };

/** A decided application as a card; an approved one opens the group (owner 2026-10-23: "who, all members, when created, stories posted"). */
function DecidedCard({ app }: { app: AdminGroupApplication }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  /** Approved and still there (the owner or the Desk may have deleted it since). */
  const live = app.status === "approved" && Boolean(app.groupUsername);
  const deleted = app.status === "approved" && !app.groupUsername;
  const approved = live;
  const remove = useMutation({
    mutationFn: () => api.admin.deleteGroup(app.id),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.adminGroups, data);
      setOpen(false);
      toast.success(`@${app.groupUsername ?? app.username} deleted`);
    },
    onError: (error) => toast.error("Couldn't delete the group", { description: errorMessage(error) }),
  });
  return (
    <article className="card flex flex-col overflow-hidden">
      <div aria-hidden className={cn("h-14", approved ? "bg-tint" : "bg-surface-2")} />
      <div className="-mt-9 flex flex-1 flex-col items-center gap-1 px-4 pb-4 text-center">
        <Avatar src={app.image} name={app.name} size="lg" ring="ink" decorative />
        <h3 className="mt-1.5 line-clamp-1 text-base font-bold text-ink">{app.name}</h3>
        <p className="text-sm text-muted">@{app.groupUsername ?? app.username}</p>
        <span
          className={cn(
            "mt-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold",
            approved ? "bg-success-soft text-success-strong" : deleted ? "bg-surface-2 text-muted" : "bg-tint text-brand",
          )}
        >
          {deleted ? "Deleted" : approved ? "Approved" : "Turned down"}
          {app.decidedAt && !deleted && ` · ${dateText(app.decidedAt)}`}
        </span>
        {app.about && <p className="mt-2 line-clamp-2 text-sm text-ink-2">{app.about}</p>}
        <Link
          href={deskPersonHref(app.applicant.username)}
          className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-tint"
        >
          <Avatar src={app.applicant.image} name={app.applicant.name} size="sm" decorative />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{approved ? "Owner" : "Applied by"}</span>
            <span className="block truncate text-sm font-semibold text-ink">{app.applicant.name}</span>
          </span>
        </Link>
        {!approved && app.deskNote && <p className="mt-2 text-xs text-muted">Note: {app.deskNote}</p>}
        {approved && (
          <Button variant="outline" size="sm" fullWidth className="mt-3" onClick={() => setOpen(true)}>
            Members &amp; stories
          </Button>
        )}
      </div>
      {approved && (
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={app.name}
          description={`@${app.groupUsername ?? app.username}`}
          size="lg"
          className="sm:max-w-4xl"
          footer={
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              leftIcon={<Trash2 aria-hidden />}
              onClick={() => {
                if (window.confirm(`Delete @${app.groupUsername} for good? Its profile, stories and Press Pass go; the members keep their own accounts.`)) remove.mutate();
              }}
            >
              Delete group
            </Button>
          }
        >
          <GroupDetail applicationId={app.id} className="rounded-xl border-0" />
        </Modal>
      )}
    </article>
  );
}

function GroupDetail({ applicationId, className }: { applicationId: string; className?: string }) {
  const query = useQuery({ queryKey: qk.adminGroup(applicationId), queryFn: ({ signal }) => api.admin.groupDetail(applicationId, signal) });
  if (query.isPending) return <div aria-hidden className="skeleton mx-4 mb-4 h-40 rounded-xl" />;
  if (query.isError || !query.data) return <p className="px-4 pb-4 text-sm text-muted">Couldn&rsquo;t load the group. {errorMessage(query.error)}</p>;
  const { group, stories, members, recent } = query.data;
  const owner = members.find((m) => m.role === "owner");
  const stats: [string, string | number][] = [
    ["Created", dateText(group.createdAt)],
    ["Press Pass", group.passNumber ?? "—"],
    ["Followers", group.followers],
    ["Live stories", stories.published],
    ["Drafts", stories.drafts],
    ["Waiting for an editor", stories.waiting],
  ];
  return (
    <div className={cn("flex flex-col gap-5 border-t border-border bg-surface-2/50 px-4 py-4", className)}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface px-3 py-2.5">
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-0.5 text-sm font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
            Members ({members.length}){owner && <span className="font-normal normal-case tracking-normal"> · owner {owner.user.name}</span>}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m.user.id}>
                <Link
                  href={deskPersonHref(m.user.username)}
                  className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 transition-colors hover:bg-tint"
                >
                  <Avatar src={m.user.image} name={m.user.name} size="sm" decorative />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{m.user.name}</span>
                    <span className="block truncate text-xs text-muted">
                      @{m.user.username} · {m.status === "invited" ? "invited, not joined yet" : `joined ${dateText(m.joinedAt)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {m.storiesPosted} {m.storiesPosted === 1 ? "story" : "stories"}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", ROLE_TONE[m.role])}>{GROUP_ROLE_LABELS[m.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Latest stories · who wrote them</h3>
          {recent.length === 0 ? (
            <p className="rounded-xl bg-surface px-3 py-3 text-sm text-muted">No stories yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((story) => (
                <li key={story.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <Link href={deskStoryHref(story.title)} className="block truncate text-sm font-semibold text-ink hover:text-brand hover:underline">
                      {story.title || "Untitled story"}
                    </Link>
                    <span className="block truncate text-xs text-muted">
                      {story.writer ? (
                        <>
                          by{" "}
                          <Link href={deskPersonHref(story.writer.username)} className="font-semibold text-ink-2 hover:text-brand hover:underline">
                            {story.writer.name}
                          </Link>
                        </>
                      ) : (
                        "writer unknown"
                      )}{" "}
                      · {dateText(story.at)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                      story.status === "published" ? "bg-success-soft text-success-strong" : "bg-surface-2 text-ink-2",
                    )}
                  >
                    {STORY_STATUS[story.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
