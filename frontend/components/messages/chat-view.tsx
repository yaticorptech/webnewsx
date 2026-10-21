"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowUp, Newspaper, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { BackButton } from "@/components/layout/back-button";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { CHAT_LIMITS, messagePreview, type ChatMessage, type ConversationDetail, type Page } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChatMenu } from "./chat-actions";
import { ChatAvatar } from "./chat-avatar";
import { useOnline } from "./presence";
import { ChatDetailsModal } from "./chat-details";

type MessagesData = InfiniteData<Page<ChatMessage>, string | null>;

const RUN_GAP_MS = 60 * 60_000;
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** "10:05 AM" today, "Mon 10:05 AM" this week, "Sep 24, 2026, 10:05 AM" before. */
function stampLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `Today ${timeFormat.format(date)}`;
  if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60_000) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${timeFormat.format(date)}`;
  }
  return formatDate(date, "date-time");
}

/** What scrolls the messages: the chat pane of the ≥1024px two-pane Messages (messages-panes.tsx), else the page. */
function scroller(): HTMLElement {
  const pane = document.querySelector<HTMLElement>("[data-chat-pane]");
  return pane && /auto|scroll/.test(getComputedStyle(pane).overflowY) ? pane : document.documentElement;
}

function nearBottom(): boolean {
  const el = scroller();
  return el.clientHeight + el.scrollTop >= el.scrollHeight - 240;
}

function scrollToBottom(smooth = false) {
  const el = scroller();
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/**
 * One chat (owner 2026-09-30, like Instagram): the header (photo, name, who / how many), a message request banner,
 * the messages oldest → newest — yours on the right in red, theirs on the left with their photo; shared stories and
 * profiles as cards; "Seen" under your last message in a direct chat — and the composer pinned above the tab bar.
 * Tap a message for its time (and "Unsend" on yours). Live via `messages.changed`; opening it marks it read.
 */
export function ChatView({ id }: { id: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(72);

  const detail = useQuery({
    queryKey: qk.chat(id),
    queryFn: ({ signal }) => api.messages.detail(id, signal),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
    // Keeps the header's "Active now" current.
    refetchInterval: 60_000,
  });
  const messages = useInfiniteQuery({
    queryKey: qk.chatMessages(id),
    queryFn: ({ pageParam, signal }) => api.messages.list(id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: detail.isSuccess,
  });

  // Oldest → newest.
  const list = (messages.data?.pages ?? [])
    .flatMap((page) => page.items)
    .slice()
    .reverse();
  const last = list.at(-1);

  // Seen = read: whenever a newer message shows up while the tab is visible.
  const readFor = useRef<string | null>(null);
  useEffect(() => {
    if (!detail.data || !last || last.mine) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || readFor.current === last.id) return;
      readFor.current = last.id;
      api.messages
        .read(id)
        .then((counts) => queryClient.setQueryData(qk.messagesUnread, counts))
        .catch(() => {
          readFor.current = null;
        });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [detail.data, last, id, queryClient]);

  // Land at the newest message; follow new ones while you're at the bottom (always after your own).
  const lastId = last?.id ?? null;
  const shownLast = useRef<string | null>(null);
  const keepOffset = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (keepOffset.current !== null) {
      // "Earlier messages" loaded above: stay where you were.
      const el = scroller();
      el.scrollBy(0, el.scrollHeight - keepOffset.current);
      keepOffset.current = null;
      return;
    }
    if (!lastId || lastId === shownLast.current) return;
    const first = shownLast.current === null;
    const wasNear = nearBottom();
    shownLast.current = lastId;
    if (first) scrollToBottom();
    else if (wasNear || last?.mine) scrollToBottom(true);
  }, [lastId, last?.mine, messages.data]);

  const loadEarlier = () => {
    keepOffset.current = scroller().scrollHeight;
    void messages.fetchNextPage();
  };

  if (detail.isError) {
    const gone = isApiError(detail.error) && detail.error.status === 404;
    return (
      <EmptyState
        title={gone ? "This chat isn't available" : "Couldn't load this chat"}
        description={gone ? "It may have been deleted, or you're no longer in it." : "Check your connection and try again."}
        action={<Button href="/messages">Back to messages</Button>}
      />
    );
  }
  if (!detail.data || !viewer) return <ChatSkeleton />;
  const chat = detail.data;

  // "Seen": under your newest message when the other person has read past it.
  const lastMine = [...list].reverse().find((m) => m.mine);
  const seen =
    chat.kind === "direct" && lastMine && chat.peerReadAt && new Date(chat.peerReadAt) >= new Date(lastMine.createdAt)
      ? lastMine.id
      : null;

  return (
    // Room under the last message for the fixed composer. Phones (owner 2026-09-30, Instagram's chat screen): the
    // chat fills the screen — `data-chat-screen` hides the masthead, tab bar and back-to-top (globals.css). ≥1024px it
    // fills the right pane of the two-pane Messages, the composer pinned to the pane's bottom.
    <section
      data-chat-screen=""
      aria-label={`Chat with ${chat.title}`}
      className="flex min-h-[calc(100dvh-14rem)] flex-col pb-(--composer-h) max-md:-mt-3 max-md:min-h-dvh lg:min-h-full lg:pb-0"
      style={{ "--composer-h": `${composerHeight}px` } as CSSProperties}
    >
      <ChatHeader chat={chat} onInfo={() => setDetailsOpen(true)} />

      {chat.request && <RequestBanner chat={chat} onDeleted={() => router.push("/messages")} />}

      <div className="flex flex-1 flex-col py-4 lg:px-5">
        {/* A chat nobody has written in yet (owner 2026-09-30, like Instagram): who it's with — gone once the first
            message is sent (a group's "created the chat" lines don't count). */}
        {messages.isSuccess && !messages.hasNextPage && list.every((m) => m.kind === "system") && <ChatIntro chat={chat} />}
        {messages.hasNextPage && (
          <div className="flex justify-center pb-3">
            <Button variant="ghost" size="sm" loading={messages.isFetchingNextPage} onClick={loadEarlier}>
              Earlier messages
            </Button>
          </div>
        )}
        {messages.isPending ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <SpeedLinesLoader label="Loading messages" />
          </div>
        ) : (
          // Messages sit at the bottom, next to the composer.
          <div className="mt-auto flex flex-col gap-0.5">
            {list.map((message, index) => {
              const prev = list[index - 1];
              const next = list[index + 1];
              const gap = !prev || new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > RUN_GAP_MS;
              const sameAsPrev =
                !gap && prev && prev.kind !== "system" && message.kind !== "system" && prev.sender?.id === message.sender?.id;
              const sameAsNext =
                next &&
                next.kind !== "system" &&
                message.kind !== "system" &&
                next.sender?.id === message.sender?.id &&
                new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() <= RUN_GAP_MS;
              return (
                <div key={message.id}>
                  {gap && (
                    <p className="py-3 text-center text-[0.6875rem] font-semibold text-muted">{stampLabel(message.createdAt)}</p>
                  )}
                  <MessageRow
                    chatId={id}
                    message={message}
                    showName={chat.kind !== "direct" && !message.mine && !sameAsPrev}
                    showAvatar={!message.mine && !sameAsNext}
                    runStart={!sameAsPrev}
                    seen={seen === message.id}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Composer chatId={id} disabled={false} onHeight={setComposerHeight} />
      <ChatDetailsModal chat={chat} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </section>
  );
}

/**
 * Back arrow and the chat on one line (owner 2026-09-30: no separate back row, no details icon). Tapping the photo /
 * name opens the details (the person's profile, members, leave / delete).
 */
function ChatHeader({ chat, onInfo }: { chat: ConversationDetail; onInfo: () => void }) {
  const online = useOnline(chat.peerActiveAt);
  const subtitle =
    chat.kind === "direct" && chat.peer ? (
      online ? (
        <span className="flex items-center gap-1.5 font-semibold text-success-strong">
          <span aria-hidden className="size-2 rounded-full bg-success" />
          Active now
        </span>
      ) : (
        <UserHandle username={chat.peer.username} truncate />
      )
    ) : chat.kind === "community" ? (
      <span className="truncate">
        Community · {chat.memberCount} {chat.memberCount === 1 ? "member" : "members"}
      </span>
    ) : (
      <span className="truncate">{chat.memberCount} people</span>
    );
  const verified = chat.kind === "direct" && chat.peer?.reporterLevel === "verified";
  return (
    // Always in view while the messages scroll (owner 2026-09-30): phones — pinned to the top of the screen (the masthead
    // is hidden there), edge to edge; from 768px — pinned just under the site's sticky bar.
    // ≥1024px: pinned to the top of the chat pane, and no back arrow (the chat list is right beside it).
    <header className="sticky z-30 flex items-center gap-2 border-b border-border bg-bg pb-3 max-md:min-h-[calc(var(--safe-top)+4.25rem)] max-md:top-0 max-md:z-40 max-md:-mx-4 max-md:px-3 max-md:pb-2 max-md:pt-[calc(var(--safe-top)+0.5rem)] sm:max-md:-mx-6 sm:max-md:px-5 md:top-(--nav-h) md:pt-3 lg:top-0 lg:bg-surface lg:px-4">
      {/* No arrow in the Android app (owner 2026-10-05): the phone's back button does it. */}
      <span data-app-no-back="" className="contents">
        <BackButton fallback="/messages" className="lg:hidden" />
      </span>
      <button
        type="button"
        onClick={onInfo}
        aria-label={`${chat.title}, chat details`}
        // Phones (owner 2026-10-16: "in the middle, like Instagram"): the photo and name centred on the screen, between
        // the back arrow and the ⋯ menu. Computers keep it on the left.
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pl-1 pr-2 text-left transition-colors hover:bg-tint max-md:absolute max-md:left-1/2 max-md:max-w-[calc(100%-7.5rem)] max-md:flex-none max-md:-translate-x-1/2 max-md:gap-2.5"
      >
        <ChatAvatar kind={chat.kind} title={chat.title} image={chat.image} peer={chat.peer} preview={chat.preview} size={44} online={online} />
        <span className="min-w-0 flex-1 max-md:flex-initial">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[0.9375rem] font-extrabold text-ink">{chat.title}</span>
            {verified && <VerifiedBadge size={16} tooltip={false} focusable={false} />}
          </span>
          <span className="flex min-w-0 text-[0.8125rem] font-medium text-muted">{subtitle}</span>
        </span>
      </button>
      <span className="ml-auto shrink-0">
        <ChatMenu chat={chat} onInfo={onInfo} />
      </span>
    </header>
  );
}

function ChatIntro({ chat }: { chat: ConversationDetail }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 text-center">
      <ChatAvatar kind={chat.kind} title={chat.title} image={chat.image} peer={chat.peer} preview={chat.preview} size={88} />
      <p className="mt-2 font-wide text-lg font-extrabold text-ink">{chat.title}</p>
      {chat.kind === "direct" && chat.peer ? (
        <>
          <UserHandle username={chat.peer.username} className="text-sm text-muted" />
          <Button href={`/${chat.peer.username}`} variant="outline" size="sm" className="mt-2">
            View profile
          </Button>
        </>
      ) : (
        <p className="max-w-xs text-sm text-muted">{chat.description || "Say hello — everyone here sees your messages."}</p>
      )}
    </div>
  );
}

function RequestBanner({ chat, onDeleted }: { chat: ConversationDetail; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.messages.accept(chat.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      toast.success("Accepted", {
        description: "The chat moved to your messages.",
      });
    },
    onError: (error) => toast.error("Couldn't accept", { description: errorMessage(error) }),
  });
  const decline = useMutation({
    mutationFn: () => api.messages.remove(chat.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      onDeleted();
    },
    onError: (error) => toast.error("Couldn't delete", { description: errorMessage(error) }),
  });
  const who = chat.kind === "direct" ? chat.title : "Someone you don't follow";
  return (
    <div className="panel-tint mt-3 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-snug text-ink-2">
        <strong className="font-bold text-ink">{who}</strong>{" "}
        {chat.kind === "direct" ? "wants to send you a message." : "added you to this chat."} Accept to move it to your chats — or
        delete it.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept
        </Button>
        <Button size="sm" variant="outline" loading={decline.isPending} onClick={() => decline.mutate()}>
          {chat.kind === "direct" ? "Delete" : "Leave"}
        </Button>
      </div>
    </div>
  );
}

function MessageRow({
  chatId,
  message,
  showName,
  showAvatar,
  runStart,
  seen,
}: {
  chatId: string;
  message: ChatMessage;
  showName: boolean;
  showAvatar: boolean;
  runStart: boolean;
  seen: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const unsend = useMutation({
    mutationFn: () => api.messages.unsend(chatId, message.id),
    onSuccess: () => {
      queryClient.setQueryData<MessagesData>(qk.chatMessages(chatId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((m) => m.id !== message.id),
              })),
            }
          : data,
      );
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
    },
    onError: (error) => toast.error("Couldn't unsend", { description: errorMessage(error) }),
  });

  if (message.kind === "system") {
    return (
      <p className="px-6 py-2 text-center text-xs font-medium text-muted">
        {messagePreview({
          ...message,
          senderName: message.sender?.name ?? null,
        })}
      </p>
    );
  }

  const mine = message.mine;
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", runStart && "mt-2")}>
      {showName && message.sender && (
        <p className="mb-0.5 ml-11 text-[0.6875rem] font-semibold text-muted">{message.sender.name}</p>
      )}
      <div className={cn("flex max-w-[85%] items-end gap-2 sm:max-w-[75%]", mine && "flex-row-reverse")}>
        {!mine && (
          <span className="w-8 shrink-0">
            {showAvatar && message.sender && (
              <Link href={`/${message.sender.username}`} aria-label={message.sender.name}>
                <Avatar src={message.sender.image} name={message.sender.name} size={32} decorative />
              </Link>
            )}
          </span>
        )}
        <div className={cn("flex min-w-0 flex-col gap-1", mine ? "items-end" : "items-start")}>
          {message.kind === "article" && <SharedStoryCard message={message} />}
          {message.kind === "profile" && <SharedProfileCard message={message} />}
          {message.text && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className={cn(
                "max-w-full rounded-[1.25rem] px-3.5 py-2 text-left text-[0.9375rem] leading-snug whitespace-pre-wrap wrap-anywhere",
                mine ? "bg-brand text-brand-contrast" : "bg-surface-3 text-ink",
              )}
            >
              {message.text}
            </button>
          )}
          {!message.text && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="text-[0.6875rem] font-semibold text-muted hover:text-ink"
            >
              {open ? "Hide" : "Details"}
            </button>
          )}
        </div>
      </div>
      {open && (
        <p className={cn("mt-1 flex items-center gap-3 text-[0.6875rem] font-medium text-muted", !mine && "ml-10")}>
          <span>{stampLabel(message.createdAt)}</span>
          {mine && (
            <button
              type="button"
              disabled={unsend.isPending}
              onClick={() => unsend.mutate()}
              className="font-bold text-brand hover:underline disabled:opacity-50"
            >
              Unsend
            </button>
          )}
        </p>
      )}
      {seen && <p className="mt-0.5 text-[0.6875rem] font-semibold text-muted">Seen</p>}
    </div>
  );
}

function SharedStoryCard({ message }: { message: ChatMessage }) {
  const story = message.article;
  if (!story) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm text-muted">
        <Newspaper aria-hidden className="size-4" />
        This story isn&rsquo;t available any more
      </p>
    );
  }
  return (
    <Link
      href={`/a/${story.slug}`}
      className="block w-56 overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-colors hover:border-brand sm:w-64"
    >
      <span className="flex items-center gap-2 px-3 py-2">
        <Avatar src={story.author.image} name={story.author.name} size={24} decorative />
        <span className="min-w-0 truncate text-xs font-bold text-ink">{story.author.name}</span>
        {story.author.reporterLevel === "verified" && (
          <VerifiedBadge size={14} animate={false} tooltip={false} focusable={false} />
        )}
      </span>
      <span className="relative block aspect-4/5 bg-surface-3">
        <img
          src={story.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          style={
            story.coverBlur
              ? {
                  backgroundImage: `url(${story.coverBlur})`,
                  backgroundSize: "cover",
                }
              : undefined
          }
        />
      </span>
      <span className="block px-3 py-2.5">
        <span className="kicker block text-brand">Story</span>
        <span className="mt-0.5 line-clamp-3 block text-sm font-extrabold leading-snug text-ink">{story.title}</span>
      </span>
    </Link>
  );
}

function SharedProfileCard({ message }: { message: ChatMessage }) {
  const person = message.profile;
  if (!person) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm text-muted">
        <UserRound aria-hidden className="size-4" />
        This profile isn&rsquo;t available any more
      </p>
    );
  }
  return (
    <Link
      href={`/${person.username}`}
      className="flex w-56 flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-4 text-center shadow-card transition-colors hover:border-brand sm:w-60"
    >
      <Avatar src={person.image} name={person.name} size={64} decorative />
      <span className="mt-1 flex max-w-full items-center gap-1 text-sm font-extrabold text-ink">
        <span className="truncate">{person.name}</span>
        {person.reporterLevel === "verified" && <VerifiedBadge size={14} animate={false} tooltip={false} focusable={false} />}
      </span>
      <UserHandle username={person.username} truncate className="text-xs text-muted" />
      {person.bio && <span className="line-clamp-2 text-xs text-ink-2">{person.bio}</span>}
      <span className="mt-1 rounded-full bg-tint-2 px-3 py-1 text-xs font-bold text-brand-strong">View profile</span>
    </Link>
  );
}

function Composer({ chatId, disabled, onHeight }: { chatId: string; disabled: boolean; onHeight: (px: number) => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The page keeps room for it as it grows.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const observer = new ResizeObserver(() => onHeight(form.offsetHeight));
    observer.observe(form);
    return () => observer.disconnect();
  }, [onHeight]);

  // Grow with the text, up to ~5 lines.
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 132)}px`;
  }, [text]);

  const send = useMutation({
    mutationFn: (body: string) => api.messages.post(chatId, { text: body }),
    onSuccess: ({ message }) => {
      queryClient.setQueryData<MessagesData>(qk.chatMessages(chatId), (data) => {
        if (!data || data.pages.length === 0) return data;
        const [first, ...rest] = data.pages;
        if (!first || first.items.some((m) => m.id === message.id)) return data;
        return {
          ...data,
          pages: [{ ...first, items: [message, ...first.items] }, ...rest],
        };
      });
      void queryClient.invalidateQueries({ queryKey: qk.inbox("primary") });
    },
    onError: (error, body) => {
      setText((current) => current || body);
      toast.error("Message not sent", {
        description: errorMessage(error),
        id: "chat-send",
      });
    },
  });

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    send.mutate(body);
    ref.current?.focus();
  };

  // Enter sends — on phones too (owner 2026-10-05: it used to start a new line there); Shift+Enter is a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  // Phone keyboards often report Enter only as the line break it types (no "Enter" key event): send instead.
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
      if (!window.matchMedia("(pointer: coarse)").matches) return;
      event.preventDefault();
      formRef.current?.requestSubmit();
    };
    field.addEventListener("beforeinput", onBeforeInput);
    return () => field.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // Fixed at the bottom of the screen (owner 2026-09-30: it never scrolls with the messages; phones have no tab bar
      // on the chat screen) — lined up with the page column. ≥1024px: pinned to the bottom of the chat pane.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur-md lg:sticky lg:inset-x-auto lg:bg-surface/95"
    >
      <div className="mx-auto flex w-full max-w-172 items-end gap-2 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-4">
        <div className="flex min-w-0 flex-1 items-end gap-2 rounded-3xl border border-border-strong bg-surface py-1.5 pl-4 pr-1.5 shadow-card focus-within:border-brand">
          <textarea
            ref={ref}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            enterKeyHint="send"
            maxLength={CHAT_LIMITS.messageMax}
            placeholder="Message…"
            aria-label="Message"
            disabled={disabled}
            className="max-h-33 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[0.9375rem] leading-snug text-ink outline-none placeholder:text-muted-2"
          />
          <button
            type="submit"
            disabled={!text.trim() || disabled}
            aria-label="Send"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast transition-opacity disabled:opacity-40"
          >
            <ArrowUp aria-hidden className="size-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </form>
  );
}

function ChatSkeleton() {
  return (
    <div data-chat-screen="" role="status" aria-label="Loading chat" className="flex flex-col gap-4 max-md:pt-3 lg:p-5">
      <div className="card flex items-center gap-3 px-4 py-3">
        <Skeleton shape="circle" className="size-11" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/3 rounded-sm" />
          <Skeleton className="h-3 w-1/4 rounded-sm" />
        </div>
      </div>
      {[60, 40, 70, 30, 55].map((w, i) => (
        <Skeleton key={i} className={cn("h-9 rounded-[1.25rem]", i % 2 ? "self-end" : "self-start")} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
