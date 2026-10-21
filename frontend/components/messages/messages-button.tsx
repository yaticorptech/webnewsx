"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** Chats with unread messages (shared by the masthead's icon and the phone bar's Messages tab). */
export function useUnreadMessages() {
  const viewer = useViewer();
  return useQuery({
    queryKey: qk.messagesUnread,
    queryFn: ({ signal }) => api.messages.unread(signal),
    initialData: { unread: viewer?.unreadMessages ?? 0, requests: 0 },
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: Boolean(viewer?.username),
  });
}

/**
 * The masthead's Messages icon (owner 2026-09-30, just left of the profile photo; on phones it's a tab in the bottom
 * bar instead — owner 2026-10-09 — and this one is hidden there, still mounted for the live pings and toasts; owner 2026-10-05: a plain chat bubble
 * instead of the paper plane, which looked like Telegram's) with the
 * number of chats that have unread messages. Live: the server pings this viewer's own stream (`messages.changed`) and
 * every open chat query refreshes; a new message outside the chat you're reading pops a toast. Logged out (owner
 * 2026-09-30), the icon is there too and asks you to log in, like Like does.
 */
export function MessagesButton({ className }: { className?: string }) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const authPrompt = useAuthPrompt();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const { data } = useUnreadMessages();

  useRealtimeEvent("messages.changed", ({ conversationId, reason }) => {
    void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
    if (reason !== "message") {
      if (reason === "update") void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
    if (pathRef.current === `/messages/${conversationId}`) return;
    // Name the chat when the inbox knows it (fetched right after the ping). Straight from the API, not through the
    // cache: qk.inbox holds the Messages page's paged list, which a single page written there would break.
    void api.messages
      .inbox("primary")
      .then((inbox) => {
        const chat = inbox.items.find((item) => item.id === conversationId);
        if (!chat || chat.lastMessage?.mine || chat.unread === 0) return;
        // Who and where only — never what the message says (owner 2026-09-30).
        const from = chat.lastMessage?.senderName;
        toast(chat.title, {
          id: `message-${conversationId}`,
          description: chat.kind === "direct" ? "Sent you a message" : from ? `New message from ${from}` : "New message",
          action: { label: "Reply", href: `/messages/${conversationId}` },
        });
      })
      .catch(() => {});
  });
  useRealtimeReconnect(() => void queryClient.invalidateQueries({ queryKey: qk.messagesAll }));

  const iconClass = cn(
    "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-tint-2 hover:text-brand after:absolute after:-inset-0.5 after:content-['']",
    className,
  );
  const icon = <MessageCircle aria-hidden className="size-5" strokeWidth={2} />;

  if (!viewer) {
    return (
      <button
        type="button"
        aria-label="Messages"
        title="Messages"
        onClick={() => authPrompt.open("Log in to send messages")}
        className={cn(iconClass, "text-ink")}
      >
        {icon}
      </button>
    );
  }
  if (!viewer.username) return null;
  const unread = data?.unread ?? 0;
  const active = pathname.startsWith("/messages");
  const label = unread > 0 ? `Messages, ${unread} unread` : "Messages";

  return (
    <Link
      href="/messages"
      aria-label={label}
      title="Messages"
      aria-current={active ? "page" : undefined}
      className={cn(iconClass, active ? "bg-tint-2 text-brand" : "text-ink")}
    >
      {icon}
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-bold leading-none tabular-nums text-brand-contrast ring-2 ring-surface"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
