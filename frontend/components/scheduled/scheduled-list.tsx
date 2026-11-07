"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Cake, Mail, Newspaper, PenLine, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ScheduledItem } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { formatScheduled } from "./schedule-dialog";

const TYPE = {
  article: { label: "Article", Icon: Newspaper },
  birthday: { label: "Birthday wish", Icon: Cake },
  invitation: { label: "Invitation", Icon: Mail },
} as const;

/**
 * The small "Scheduled" button on the + page (owner 2026-11-06: "show scheduled articles list also in post article page
 * small button") with the count waiting; it opens the list. `?scheduled=1` opens it straight away (after scheduling).
 */
export function ScheduledButton({ className, compact = false }: { className?: string; /** Icon + count only on narrow phones (the composer header). */ compact?: boolean }) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("scheduled") === "1");
  const { data } = useQuery({ queryKey: qk.scheduled, queryFn: ({ signal }) => api.scheduled.list(signal), staleTime: 30_000 });
  const count = data?.items.length ?? 0;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("scheduled") !== "1") return;
    url.searchParams.delete("scheduled");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[0.8125rem] font-bold text-ink transition-colors hover:border-border-strong",
          className,
        )}
      >
        <CalendarClock aria-hidden className="size-4 text-brand" />
        <span className={cn(compact && "max-[399px]:sr-only")}>Scheduled</span>
        {count > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[0.6875rem] leading-5 text-brand-contrast">{count}</span>
        )}
      </button>
      <ScheduledList open={open} onOpenChange={setOpen} items={data?.items ?? null} />
    </>
  );
}

function ScheduledList({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: ScheduledItem[] | null }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Scheduled" description="These go live on their own at the time shown." size="md">
      {items === null ? (
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CalendarClock aria-hidden className="size-8 text-faint" />
          <p className="font-bold text-ink">Nothing scheduled</p>
          <p className="max-w-xs text-sm text-muted">Use Schedule next to Publish, or under a birthday wish or invitation, to post it later.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <ScheduledRow key={`${item.type}:${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ScheduledRow({ item }: { item: ScheduledItem }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"now" | "cancel" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { label, Icon } = TYPE[item.type];
  const isArticle = item.type === "article";

  const run = async (action: "now" | "cancel") => {
    setBusy(action);
    try {
      if (action === "now") await api.scheduled.publishNow(item.type, item.id);
      else await api.scheduled.cancel(item.type, item.id);
      void queryClient.invalidateQueries({ queryKey: qk.scheduled });
      if (!isArticle) void queryClient.invalidateQueries({ queryKey: qk.wishes });
      toast.success(
        action === "now" ? (isArticle ? "Your story is live" : "Posted") : isArticle ? "Moved to Drafts" : "Removed",
        { id: "scheduled-action", description: action === "now" ? "Followers are being notified." : isArticle ? "It won't go live until you publish it." : undefined },
      );
    } catch (error) {
      toast.error("Couldn't do that", { id: "scheduled-action", description: errorMessage(error) });
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <li className="flex gap-3 py-3">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon aria-hidden className="absolute inset-0 m-auto size-6 text-faint" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Icon aria-hidden className="size-3.5" />
          {label}
        </p>
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{item.title || label}</p>
        <p className="text-xs text-muted">
          <span className="font-semibold text-brand">{formatScheduled(item.scheduledAt)}</span> · <TimeAgo date={item.scheduledAt} />
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" leftIcon={<Send aria-hidden />} loading={busy === "now"} disabled={busy !== null} onClick={() => void run("now")}>
            Publish now
          </Button>
          {isArticle && (
            <Button size="sm" variant="ghost" leftIcon={<PenLine aria-hidden />} href={`/publish/${item.id}`} disabled={busy !== null}>
              Edit
            </Button>
          )}
          {confirming ? (
            <Button size="sm" variant="danger" loading={busy === "cancel"} disabled={busy === "now"} onClick={() => void run("cancel")}>
              {isArticle ? "Yes, move to Drafts" : "Yes, remove"}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirming(true)} className="text-muted">
              Cancel schedule
            </Button>
          )}
        </div>
        {isArticle && (
          <p className="text-[0.6875rem] text-faint">
            Editing it and saving as a draft takes it off the schedule.
          </p>
        )}
      </div>
    </li>
  );
}
