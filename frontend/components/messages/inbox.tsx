"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { SquarePen, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ConversationSummary, InboxFolder } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./chat-avatar";
import { useOnline } from "./presence";
import { NewChatModal } from "./new-chat-modal";

/**
 * /messages (owner 2026-09-30, like Instagram): your chats — direct messages, groups and community chats — latest
 * first, unread ones bold with a red dot; "Requests" holds messages from people you don't follow until you accept them.
 * The pencil starts a chat or a group. Live through `messages.changed` (MessagesButton refreshes every chat query).
 * `pane`: the left column of the ≥1024px two-pane Messages (messages-panes.tsx) — compact header, no back arrow, the
 * open chat highlighted.
 */
export function Inbox({ pane = false }: { pane?: boolean }) {
  const [folder, setFolder] = useState<InboxFolder>("primary");
  const [composing, setComposing] = useState(false);
  const pathname = usePathname();
  const headingId = useId();

  const list = useInfiniteQuery({
    queryKey: qk.inbox(folder),
    queryFn: ({ pageParam, signal }) => api.messages.inbox(folder, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Keeps the online dots current while the list is open.
    refetchInterval: 60_000,
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col", pane ? "gap-3 px-4 pt-4" : "gap-5")}>
      {/* "Messages", Communities and New share one line at every width (owner 2026-10-01): phones show Communities as
          just its icon and "New" without "message". */}
      <PageHeader
        id={headingId}
        title="Messages"
        back={pane ? null : "/"}
        compact={pane}
        actions={
          <>
            <Button
              href="/communities"
              variant="outline"
              size="sm"
              title="Communities"
              leftIcon={<UsersRound aria-hidden />}
              className={pane ? "w-8 px-0" : "max-sm:w-8 max-sm:px-0"}
            >
              <span className={pane ? "sr-only" : "max-sm:sr-only"}>Communities</span>
            </Button>
            <Button size="sm" leftIcon={<SquarePen aria-hidden />} onClick={() => setComposing(true)}>
              New<span className={pane ? "sr-only" : "max-sm:sr-only"}>&nbsp;message</span>
            </Button>
          </>
        }
        className="flex-nowrap"
      />

      <Tabs
        ariaLabel="Inbox"
        value={folder}
        onValueChange={(value) => setFolder(value as InboxFolder)}
        items={[
          { value: "primary", label: "Chats", count: first?.unread || undefined },
          { value: "requests", label: "Requests", count: first?.requests || undefined },
        ]}
      />

      {/* The pane's own frame holds the list there; phones run the rows edge to edge (Instagram), a card from 640px. */}
      <div className={pane ? "-mx-4 -mt-3 pb-2" : "-mx-4 -mt-2 sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:bg-surface"}>
        {list.isPending ? (
          <ul aria-label="Loading chats" className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton shape="circle" className="size-13 shrink-0" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/3 rounded-sm" />
                  <Skeleton className="h-3.5 w-2/3 rounded-sm" />
                </div>
              </li>
            ))}
          </ul>
        ) : list.isError ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Couldn&rsquo;t load your messages. Try again in a moment.</p>
        ) : items.length === 0 ? (
          folder === "primary" ? (
            <EmptyState
              size="sm"
              icon={<SquarePen aria-hidden />}
              title="Your messages"
              description="Send a message, share a story or start a group with people on WebNEWS."
              action={<Button onClick={() => setComposing(true)}>Send message</Button>}
            />
          ) : (
            <EmptyState
              size="sm"
              title="No message requests"
              description="Messages from people you don't follow wait here until you accept them."
            />
          )
        ) : (
          <ul>
            {items.map((chat) => (
              <InboxRow key={chat.id} chat={chat} active={pane && pathname === `/messages/${chat.id}`} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Show older chats
            </Button>
          </div>
        )}
      </div>

      <NewChatModal open={composing} onOpenChange={setComposing} />
    </section>
  );
}

/** `active`: the chat open beside the list (two-pane Messages). */
function InboxRow({ chat, active = false }: { chat: ConversationSummary; active?: boolean }) {
  const unread = chat.unread > 0;
  const online = useOnline(chat.peerActiveAt);
  const preview = chat.lastMessage
    ? chat.lastMessage.mine && !chat.lastMessage.preview.startsWith("You ")
      ? `You: ${chat.lastMessage.preview}`
      : chat.kind !== "direct" && chat.lastMessage.senderName && !chat.lastMessage.preview.startsWith(chat.lastMessage.senderName)
        ? `${chat.lastMessage.senderName.split(" ")[0]}: ${chat.lastMessage.preview}`
        : chat.lastMessage.preview
    : chat.kind === "community"
      ? "Community chat"
      : "No messages yet";
  return (
    <li>
      <Link
        href={`/messages/${chat.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 px-4 py-3 transition-colors -outline-offset-2 hover:bg-surface-2 sm:px-5",
          active ? "bg-tint-2 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-brand" : unread && "bg-tint/50",
        )}
      >
        <ChatAvatar kind={chat.kind} title={chat.title} image={chat.image} peer={chat.peer} preview={chat.preview} size={52} online={online} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-[0.9375rem] text-ink", unread ? "font-extrabold" : "font-semibold")}>{chat.title}</span>
            {online && <span className="sr-only">, online</span>}
            {chat.kind === "community" && (
              <span className="shrink-0 rounded-full bg-tint-2 px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-brand-strong">
                Community
              </span>
            )}
          </span>
          <span className={cn("mt-0.5 flex min-w-0 items-center gap-1 text-[0.8125rem]", unread ? "font-bold text-ink" : "text-muted")}>
            <span className="truncate">{preview}</span>
            {chat.lastMessage && (
              <>
                <span aria-hidden className="shrink-0">·</span>
                <TimeAgo date={chat.lastMessage.createdAt} variant="short" className="shrink-0" />
              </>
            )}
          </span>
        </span>
        {unread && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-bold text-brand-contrast">
            <span className="sr-only">Unread messages: </span>
            {chat.unread > 99 ? "99+" : chat.unread}
          </span>
        )}
      </Link>
    </li>
  );
}
