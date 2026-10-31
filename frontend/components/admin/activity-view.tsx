"use client";

import { FileClock, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ContentLogAction, ContentLogEntry, Page } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ListEmpty, ListError, ListLoading, LiveCount, LoadMore } from "./list-parts";
import { SectionHeader } from "./section-header";
import { useDeskList } from "./use-desk-list";

const ACTION: Record<ContentLogAction, { label: string; tone: string }> = {
  published: { label: "Published", tone: "bg-success-soft text-success-strong" },
  edited: { label: "Edited", tone: "bg-[#fff4e0] text-[#8a5300]" },
  draft_saved: { label: "Saved draft", tone: "bg-surface-2 text-muted" },
  submitted: { label: "Sent to review", tone: "bg-[#eef2ff] text-[#3a46a8]" },
  sent: { label: "Sent to editors", tone: "bg-[#eef2ff] text-[#3a46a8]" },
  deleted: { label: "Deleted", tone: "bg-tint text-brand-strong" },
};

/** "Chrome on Android" from a user agent — the full string stays in the tooltip. */
function deviceOf(ua: string | null): string {
  if (!ua) return "—";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Other";
  const app = /wv\)|WebNEWSApp/i.test(ua) ? "WebNEWS app" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${app} · ${os}`;
}

/**
 * Reporter activity (owner 2026-10-31): every story an account published, edited, saved, sent for review or deleted —
 * who did it, when, and the IP address and device it came from. Kept permanently for legal requests; read-only.
 */
export function ActivityView({ initialQuery, initial }: { initialQuery: string; initial: Page<ContentLogEntry> | null }) {
  const [text, setText] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);
  const list = useDeskList({
    queryKey: qk.adminActivity(q),
    fetchPage: (cursor, signal) => api.admin.activity({ cursor, q }, signal),
    initial: q === initialQuery ? initial : null,
  });
  const items = list.items;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Reporter activity"
        description="Every story reporters publish, edit, save, send for review or delete — with the time, IP address and device. Kept for legal requests; entries can't be changed."
      />
      <label className="flex h-11 max-w-md items-center gap-2 rounded-full border border-border-strong bg-surface px-4 focus-within:border-brand">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="sr-only">Search by username or story title</span>
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Username or story title"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      <LiveCount>{list.isSuccess ? `${items.length}${list.hasNextPage ? "+" : ""} entries` : ""}</LiveCount>

      {list.isPending ? (
        <ListLoading label="Loading reporter activity" />
      ) : list.isError && items.length === 0 ? (
        <ListError message="Reporter activity didn't load." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <ListEmpty icon={<FileClock aria-hidden />} title={q ? "Nothing matches" : "Nothing recorded yet"} description="Story actions by reporters appear here as they happen." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Story</th>
                <th className="px-4 py-3">IP address</th>
                <th className="px-4 py-3">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((entry) => {
                const action = ACTION[entry.action] ?? { label: entry.action, tone: "bg-surface-2 text-muted" };
                return (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      <span title={new Date(entry.createdAt).toLocaleString("en-IN")}>
                        <TimeAgo date={entry.createdAt} />
                      </span>
                      <div className="text-xs">{new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                    </td>
                    <td className="px-4 py-3">
                      {entry.user.username ? (
                        <button type="button" onClick={() => setText(entry.user.username ?? "")} className="font-semibold text-ink hover:text-brand">
                          @{entry.user.username}
                        </button>
                      ) : (
                        <span className="text-muted">deleted account</span>
                      )}
                      {entry.actor && <div className="text-xs text-muted">by @{entry.actor.username ?? "unknown"}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", action.tone)}>{action.label}</span>
                    </td>
                    <td className="max-w-[22rem] px-4 py-3">
                      {entry.article.slug && entry.action !== "deleted" ? (
                        <Link href={`/a/${entry.article.slug}`} target="_blank" className="line-clamp-2 text-ink hover:text-brand">
                          {entry.article.title || "Untitled story"}
                        </Link>
                      ) : (
                        <span className="line-clamp-2 text-ink">{entry.article.title || "Untitled story"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink">{entry.ip ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted" title={entry.userAgent ?? undefined}>
                      {deviceOf(entry.userAgent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} label="Load older entries" />
    </div>
  );
}
