"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, Send } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CONTACT_REPLY_MAX, type DeskContactMessage, type DeskContactStatus } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ListEmpty, ListError, ListLoading, Segmented } from "./list-parts";
import { SectionHeader } from "./section-header";

const FILTERS: readonly { value: DeskContactStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "all", label: "All" },
];

/**
 * /admin/inbox (owner 2026-10-10): what members sent through Contact us, newest first, with a reply box on each. A
 * reply is saved, marks the message answered and is emailed to the member (backend queries/contact.ts).
 */
export function InboxView() {
  const [status, setStatus] = useState<DeskContactStatus>("new");
  const list = useQuery({ queryKey: qk.adminInbox(status), queryFn: ({ signal }) => api.admin.inbox(status, signal) });
  const items = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Inbox"
        description="Messages members sent through Contact us. Your reply is emailed to them and kept here."
      />
      <Segmented label="Show" options={FILTERS} value={status} onChange={setStatus} />
      {list.isPending ? (
        <ListLoading label="Loading messages" />
      ) : list.isError ? (
        <ListError message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty
          icon={<Inbox aria-hidden />}
          title={status === "new" ? "No new messages" : status === "replied" ? "No replies yet" : "No messages yet"}
          description="Messages from the Contact us page show up here."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageCard({ message }: { message: DeskContactMessage }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.reply ?? "");
  const replying = !message.reply || editing;

  const send = useMutation({
    mutationFn: () => api.admin.replyInbox(message.id, draft.trim()),
    onSuccess: () => {
      toast.success("Reply sent", { description: `Emailed to ${message.email}` });
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
      void queryClient.invalidateQueries({ queryKey: qk.adminOverview });
    },
    onError: (error) => toast.error("Couldn't send the reply", { description: errorMessage(error) }),
  });

  return (
    <li className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar src={message.image} name={message.name} size="md" decorative />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-ink">{message.name}</span>
            <span className="text-sm text-muted">@{message.username}</span>
          </p>
          <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <Mail aria-hidden className="size-3.5" />
            {message.email}
          </a>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
          <TimeAgo date={message.createdAt} />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-bold",
              message.reply ? "bg-surface-3 text-ink-2" : "bg-tint text-brand",
            )}
          >
            {message.reply ? "Replied" : "New"}
          </span>
        </span>
      </div>

      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">{message.body}</p>

      {message.reply && !editing && (
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
            <span>
              Your reply{message.repliedAt && <> · <TimeAgo date={message.repliedAt} /></>}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="font-bold text-brand hover:underline">
              Reply again
            </button>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{message.reply}</p>
        </div>
      )}

      {replying && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim().length >= 2 && !send.isPending) send.mutate();
          }}
        >
          <Textarea
            aria-label={`Reply to ${message.name}`}
            placeholder={`Reply to ${message.name}…`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={CONTACT_REPLY_MAX}
            autoGrow
            rows={3}
          />
          <div className="flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" leftIcon={<Send aria-hidden />} loading={send.isPending} disabled={draft.trim().length < 2}>
              Send reply
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
