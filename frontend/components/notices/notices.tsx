"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, EyeOff, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { UserNotice } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Notices from the Editor Desk (owner rule 2026-09-25): when the desk warns a reporter about a reported story, or
 * hides one of their stories, the reporter is told — a banner at the top of every page until they tap "Got it",
 * and the full history in their Newsroom.
 */

function useNotices(enabled: boolean) {
  return useQuery({ queryKey: qk.notices, queryFn: ({ signal }) => api.notices(signal), enabled, staleTime: 30_000 });
}

function useMarkRead() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (ids?: string[]) => api.readNotices(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notices });
      // The account menu's unread dot comes from the server-rendered viewer.
      router.refresh();
    },
    onError: (error) => toast.error("Couldn't update your notices", { description: errorMessage(error) }),
  });
}

const COPY = {
  warning: {
    icon: ShieldAlert,
    title: "Warning from the Editor Desk",
    body: (title: string) => `Readers reported your story “${title}” and the Editor Desk reviewed it.`,
    footnote: "Please follow the WebNEWS rules — repeated warnings can lead to your account being suspended.",
  },
  story_hidden: {
    icon: EyeOff,
    title: "Your story was hidden",
    body: (title: string) => `The Editor Desk hid “${title}”. It no longer appears on WebNEWS.`,
    footnote: null,
  },
} as const;

/** A warning from the automatic report rules (REPORT_RULES): no editor has looked at the story yet. */
const AUTOMATIC_WARNING = {
  ...COPY.warning,
  title: "Automatic warning",
  body: (title: string) => `Readers reported your story “${title}” soon after it went live.`,
};

const copyOf = (notice: UserNotice) => (notice.kind === "warning" && notice.automatic ? AUTOMATIC_WARNING : COPY[notice.kind]);

function NoticeBody({ notice }: { notice: UserNotice }) {
  const copy = copyOf(notice);
  const title = notice.story?.title || "one of your stories";
  return (
    <>
      <p className="text-sm leading-relaxed text-ink-2">{copy.body(title)}</p>
      {notice.message && (
        <p className="mt-2 rounded-lg border-l-4 border-brand bg-surface px-3 py-2 text-sm text-ink">
          <span className="font-bold">{notice.automatic ? "Details: " : notice.kind === "warning" ? "Message from the desk: " : "Reason: "}</span>
          {notice.message}
        </p>
      )}
      {copy.footnote && <p className="mt-2 text-xs font-semibold text-muted">{copy.footnote}</p>}
    </>
  );
}

/** Top of every site page: the reporter's unread notices, until they tap "Got it". */
export function NoticeBanner() {
  const viewer = useViewer();
  const unread = viewer?.unreadNotices ?? 0;
  const { data } = useNotices(unread > 0);
  const markRead = useMarkRead();
  const items = (data?.items ?? []).filter((notice) => !notice.read).slice(0, 3);
  if (unread === 0 || items.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-3">
      {items.map((notice) => {
        const copy = copyOf(notice);
        const Icon = copy.icon;
        return (
          <section
            key={notice.id}
            aria-labelledby={`notice-${notice.id}`}
            data-notice={notice.kind}
            className="animate-fade-up rounded-2xl border border-brand bg-brand-soft p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast">
                <Icon aria-hidden className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`notice-${notice.id}`} className="flex flex-wrap items-baseline gap-x-2 font-wide text-base font-extrabold text-ink">
                  {copy.title}
                  <TimeAgo date={notice.createdAt} variant="short" className="text-xs font-semibold text-muted" />
                </h2>
                <div className="mt-1">
                  <NoticeBody notice={notice} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" leftIcon={<Check aria-hidden />} loading={markRead.isPending} onClick={() => markRead.mutate([notice.id])}>
                    Got it
                  </Button>
                  {notice.story?.slug && (
                    <Button href={`/a/${notice.story.slug}`} size="sm" variant="outline" rightIcon={<ArrowRight aria-hidden />}>
                      View story
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Newsroom: every notice from the Editor Desk, newest first (unread ones marked). */
export function NoticesPanel() {
  const { data } = useNotices(true);
  const markRead = useMarkRead();
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  const unread = data?.unread ?? 0;

  return (
    <section id="notices" aria-labelledby="notices-heading" className="card scroll-mt-28 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="notices-heading" className="flex items-center gap-2 font-wide text-base font-extrabold text-ink">
          <ShieldAlert aria-hidden className="size-4.5 text-brand" />
          Notices from the Editor Desk
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-bold text-brand-contrast">
              {unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </h2>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => markRead.mutate(undefined)} loading={markRead.isPending}>
            Mark all as read
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map((notice) => {
          const Icon = copyOf(notice).icon;
          return (
            <li key={notice.id} className={cn("flex items-start gap-3 px-4 py-4 sm:px-5", !notice.read && "bg-tint")}>
              <Icon aria-hidden className={cn("mt-0.5 size-4.5 shrink-0", notice.read ? "text-muted" : "text-brand")} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-ink">
                  {copyOf(notice).title}
                  <TimeAgo date={notice.createdAt} variant="short" className="text-xs font-semibold text-muted" />
                  {!notice.read && <span className="text-xs font-bold text-brand">New</span>}
                </p>
                <div className="mt-1">
                  <NoticeBody notice={notice} />
                </div>
                {notice.story?.slug && (
                  <Link href={`/a/${notice.story.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-hover">
                    View story
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
