"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareOff, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetChat } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { meetTime } from "../format";

/*
 * The press meet room's chat (owner 2026-10-02): reporters ask questions while it's live, the organizer reads them,
 * can reply, and can switch the chat off for reporters (and on again). Everyone in the room gets each change at once
 * (`meet.chat` → refetch).
 */

/** The room's chat, kept fresh by `meet.chat` (the room uses it for the unread badge too). */
export function useRoomChat(meetId: string) {
  const queryClient = useQueryClient();
  const chat = useQuery({
    queryKey: qk.pressMeetChat(meetId),
    queryFn: ({ signal }) => api.pressMeets.chat(meetId, signal),
    refetchOnWindowFocus: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetChat(meetId) });
  useRealtimeEvent("meet.chat", (data) => {
    if (data.meetId === meetId) refresh();
  });
  useRealtimeReconnect(refresh);
  return chat;
}

export function RoomChat({
  meetId,
  organizer,
  chat,
  onSeen,
  className,
}: {
  meetId: string;
  organizer: boolean;
  chat: ReturnType<typeof useRoomChat>;
  /** The latest message has been on screen (clears the unread badge). */
  onSeen: (lastId: string | null) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const messages = chat.data?.messages ?? [];
  const enabled = chat.data?.enabled ?? true;
  const lastId = messages.at(-1)?.id ?? null;
  const canWrite = organizer || enabled;

  // Newest at the bottom, in view; and it counts as seen.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    onSeen(lastId);
  }, [lastId, onSeen]);

  const send = useMutation({
    mutationFn: (body: string) => api.pressMeets.sendChat(meetId, body),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetChat(meetId) });
    },
    onError: (error) => toast.error("Couldn't send your message", { description: errorMessage(error) }),
  });
  const toggle = useMutation({
    mutationFn: (next: boolean) => api.pressMeets.setChat(meetId, next),
    onSuccess: ({ enabled: next }) => {
      queryClient.setQueryData<PressMeetChat>(qk.pressMeetChat(meetId), (data) => (data ? { ...data, enabled: next } : data));
      toast(next ? "Chat is on" : "Chat is off", { description: next ? "Reporters can send questions." : "Reporters can't send messages until you turn it back on." });
    },
    onError: (error) => toast.error("Couldn't change the chat", { description: errorMessage(error) }),
  });

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body || send.isPending || !canWrite) return;
    send.mutate(body);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {organizer ? (
        <label className="flex shrink-0 cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">Chat for reporters</span>
            <span className="block text-xs text-white/55">{enabled ? "On — reporters can send questions" : "Off — only you can write"}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={toggle.isPending || chat.isPending}
            onChange={(event) => toggle.mutate(event.target.checked)}
            aria-label="Allow reporters to chat"
            className={cn(
              "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/20 transition-colors checked:bg-brand disabled:opacity-60",
              "before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5",
            )}
          />
        </label>
      ) : (
        !enabled && (
          <p className="flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/70">
            <MessageSquareOff aria-hidden className="size-4 shrink-0 text-brand" />
            The organizer has turned off the chat for now.
          </p>
        )
      )}

      <ol ref={listRef} aria-label="Chat messages" aria-live="polite" className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl bg-white/4 p-2.5">
        {chat.isPending ? (
          <li className="m-auto">
            <Loader2 aria-label="Loading the chat" className="size-5 animate-spin text-white/50" />
          </li>
        ) : chat.isError ? (
          <li className="m-auto text-center text-sm text-white/55">Couldn&rsquo;t load the chat.</li>
        ) : messages.length === 0 ? (
          <li className="m-auto max-w-56 text-center text-sm text-white/55">
            {organizer ? "Reporters' questions show up here. You can reply too." : "Ask the organizer a question — everyone in the room sees it."}
          </li>
        ) : (
          messages.map((message) => {
            const mine = message.author.id === viewer?.id;
            return (
              <li key={message.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <Avatar src={message.author.image} name={message.author.name} size={28} decorative />
                <div className={cn("min-w-0 max-w-[85%] rounded-2xl px-3 py-2", mine ? "bg-brand text-white" : "bg-white/10 text-white")}>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] font-bold">
                    <span className={cn(mine ? "text-white/85" : "text-white/75")}>{mine ? "You" : message.author.name}</span>
                    {message.role === "organizer" && (
                      <span className={cn("rounded-full px-1.5 py-px text-[0.625rem] uppercase tracking-wider", mine ? "bg-white/20" : "bg-brand text-white")}>
                        Organizer
                      </span>
                    )}
                    <span className={cn("font-semibold", mine ? "text-white/65" : "text-white/45")}>{meetTime(message.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug wrap-anywhere">{message.body}</p>
                </div>
              </li>
            );
          })
        )}
      </ol>

      <form onSubmit={submit} className="flex shrink-0 items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={PRESS_MEET.chatMax}
          disabled={!canWrite}
          placeholder={canWrite ? (organizer ? "Reply to the reporters…" : "Ask a question…") : "The chat is off"}
          aria-label={organizer ? "Message the reporters" : "Ask a question"}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-white/8 px-3.5 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:ring-brand/70 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canWrite || !text.trim() || send.isPending}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40"
        >
          {send.isPending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <SendHorizontal aria-hidden className="size-5" />}
        </button>
      </form>
    </div>
  );
}
