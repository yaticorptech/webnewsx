"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AppNotification } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { notificationParts } from "./notification-bell";

/*
 * The Notifications page (owner 2026-10-08, after a reference): back arrow and a centred title, a search box, "All" and
 * "Unread" chips with their counts and "Mark all as read", then the notifications grouped by day — Today, Yesterday,
 * then the date — each a round icon, the line in bold, a one-line snippet, the time and an unread dot; read ones are
 * dimmed. Opening one marks it read (the bell's panel marks everything read as it opens; this page doesn't).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Today" · "Yesterday" · "Monday, 6 October 2026". */
function groupOf(iso: string, now: Date): string {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return dayLabel.format(date);
}

export function NotificationsView({ username }: { username: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const list = useInfiniteQuery({
    queryKey: qk.notificationsList,
    queryFn: ({ pageParam, signal }) => api.notifications(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const unread = list.data?.pages[0]?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.readNotifications(ids),
    onSuccess: ({ unread: left }, ids) => {
      queryClient.setQueryData(qk.notificationsUnread, left);
      // Flip the rows here, no refetch: the list stays where it is.
      queryClient.setQueryData<typeof list.data>(qk.notificationsList, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                unread: left,
                items: page.items.map((item) => (!ids || ids.includes(item.id) ? { ...item, read: true } : item)),
              })),
            }
          : data,
      );
    },
    onError: (error) => toast.error("Couldn't mark them read", { description: errorMessage(error) }),
  });

  // No search box (owner 2026-10-09): All or Unread.
  const shown = items.filter((item) => filter === "all" || !item.read);
  const now = new Date();
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const item of shown) {
    const label = groupOf(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    // data-own-back: this header has the page's back arrow (the shell's is hidden, globals.css).
    <section aria-labelledby="notifications-title" data-own-back="" className="flex flex-col gap-3">
      {/* Not in the Android app (owner 2026-10-09: no title in the middle there; the phone's back button goes back) —
          data-app-no-back hides the whole row, globals.css. The <h1> still names the section for screen readers. */}
      {/* The title right beside the back arrow (owner 2026-10-09: not in the middle, less white space). */}
      <header data-app-no-back="" className="flex h-10 items-center gap-2.5">
        <BackButton fallback="/" plain />
        <h1 id="notifications-title" className="font-wide text-xl font-extrabold text-ink">
          Notifications
        </h1>
      </header>

      <div className="flex items-center gap-2">
        <FilterChip active={filter === "all"} count={items.length} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={filter === "unread"} count={unread} onClick={() => setFilter("unread")}>
          Unread
        </FilterChip>
        <button
          type="button"
          onClick={() => markRead.mutate(undefined)}
          disabled={unread === 0 || markRead.isPending}
          className="ml-auto text-[0.8125rem] font-bold text-brand transition-colors hover:text-brand-hover disabled:text-muted"
        >
          Mark all as read
        </button>
      </div>

      {list.isPending ? (
        <div className="flex justify-center py-16">
          <SpeedLinesLoader size="sm" label="Loading notifications" />
        </div>
      ) : list.isError ? (
        <p className="py-16 text-center text-sm text-muted">Couldn&rsquo;t load your notifications. Try again in a moment.</p>
      ) : shown.length === 0 ? (
        <Empty searching={filter === "unread"} />
      ) : (
        <div className="flex flex-col">
          {groups.map((group, index) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className={cn("pb-0.5 text-[0.9375rem] font-bold text-ink-2", index === 0 ? "pt-0.5" : "pt-3")}>{group.label}</h2>
              <ul className="divide-y divide-border">
                {group.items.map((item) => (
                  <Row key={item.id} item={item} username={username} onOpen={() => !item.read && markRead.mutate([item.id])} />
                ))}
              </ul>
            </section>
          ))}
          {list.hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Show older
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FilterChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full pl-3.5 pr-1.5 text-[0.8125rem] font-bold transition-colors",
        active ? "bg-tint text-brand ring-1 ring-tint-border" : "bg-surface-2 text-ink-2 hover:bg-tint",
      )}
    >
      {children}
      <span
        className={cn(
          "inline-flex h-5 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.6875rem] tabular-nums",
          active ? "bg-brand text-brand-contrast" : "bg-surface text-ink-2 ring-1 ring-border",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/** One notification: the bell's icon and line, a one-line snippet, the time on the right, an unread dot. */
function Row({ item, username, onOpen }: { item: AppNotification; username: string; onOpen: () => void }) {
  const { href, icon, text, detail, actions } = notificationParts(item, username, onOpen);
  const snippet = item.story?.title ?? item.pressMeet?.title ?? detail;
  const body = (
    <>
      <span className="shrink-0 [&>*]:size-11 [&_img]:size-11 [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 block text-[0.9375rem] leading-snug", item.read ? "font-semibold text-ink-2" : "font-bold text-ink")}>{text}</span>
        {snippet && <span className="mt-0.5 line-clamp-1 block text-[0.8125rem] leading-snug text-muted">{snippet}</span>}
        {actions}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
        {!item.read && <span aria-label="Unread" className="size-2.5 rounded-full bg-brand" />}
        <TimeAgo date={item.createdAt} className="text-xs text-muted" />
      </span>
    </>
  );
  // Read ones at full strength (owner 2026-10-09: the page looked faded — read rows were at 75% opacity); unread
  // ones stand out with bold text, the red dot and a light pink background.
  const rowClass = cn("-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5", !item.read && "bg-tint/60");
  return (
    <li>
      {href && !actions ? (
        <Link href={href} onClick={onOpen} className={cn(rowClass, "transition-colors hover:bg-tint")}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

/** Nothing to show: a small drawing of an open box with the logo's bars popping out, and a line. */
function Empty({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-14 text-center">
      <svg viewBox="0 0 160 120" aria-hidden className="w-40 text-brand">
        <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
          <path d="M30 62 L80 80 L130 62 L130 104 L80 118 L30 104 Z" fill="rgb(227 6 19 / 0.06)" />
          <path d="M30 62 L14 48 L64 30 L80 44 L96 30 L146 48 L130 62" />
          <path d="M80 80 L80 118" />
          <path d="M64 30 L80 44" />
        </g>
        <g fill="currentColor" transform="translate(58 8) scale(0.7)">
          <polygon points="20,9 60,9 48,20 8,20" />
          <polygon points="20,26 60,26 48,37 8,37" />
          <polygon points="20,43 60,43 48,54 8,54" />
        </g>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5">
          <path d="M40 18 L46 24" />
          <path d="M120 18 L114 24" />
          <path d="M80 2 L80 6" transform="translate(0 -4)" />
        </g>
      </svg>
      <p className="text-sm text-muted">{searching ? "Nothing matches here" : "Looks like there's nothing here"}</p>
    </div>
  );
}
