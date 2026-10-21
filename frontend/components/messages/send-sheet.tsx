"use client";

import { ProfileQr } from "@/components/profile/profile-qr";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SpeedBarsSvg, SpeedLines } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { StoryPoster, type PosterStory } from "@/components/poster/story-poster";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CHAT_LIMITS, type ChatPerson, type ConversationSummary, type PosterTemplate } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./chat-avatar";
import { useDebounced } from "./people-picker";

/** What the sheet sends: a story (with its poster for the clipping) or a profile. */
export type SendItem =
  | { kind: "article"; id: string; title: string; author?: string; poster?: { template?: PosterTemplate | null; story: PosterStory } }
  | { kind: "profile"; username: string; name: string; image?: string | null };

export type SendSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SendItem;
  /** Other ways to share (copy link, WhatsApp…), under "Outside WebNEWS". */
  external?: ReactNode;
};

type Section = "Recent" | "Communities & groups" | "You follow" | "Results";

/** A place to send to: a person (their direct chat) or a group / community chat. */
type Target = { key: string; name: string; sub: ReactNode; username?: string; conversationId?: string; avatar: ReactNode; section: Section };

function personTarget(person: ChatPerson, section: Section): Target {
  return {
    key: `u:${person.id}`,
    name: person.name || person.username,
    sub: <UserHandle username={person.username} truncate className="flex" />,
    username: person.username,
    avatar: <Avatar src={person.image} name={person.name} size={40} decorative />,
    section,
  };
}

function chatTarget(chat: ConversationSummary): Target {
  if (chat.kind === "direct" && chat.peer) return personTarget(chat.peer, "Recent");
  const count = `${chat.memberCount} ${chat.kind === "community" ? (chat.memberCount === 1 ? "member" : "members") : "people"}`;
  return {
    key: `c:${chat.id}`,
    name: chat.title,
    sub: `${chat.kind === "community" ? "Community" : "Group"} · ${count}`,
    conversationId: chat.id,
    avatar: <ChatAvatar kind={chat.kind} title={chat.title} image={chat.image} peer={chat.peer} preview={chat.preview} size={40} />,
    section: "Communities & groups",
  };
}

const SECTIONS: Section[] = ["Results", "Recent", "Communities & groups", "You follow"];

/**
 * "Dispatch" (owner 2026-09-30: WebNEWS's own look, design A — not Instagram's grid): the story (or profile) as a
 * clipping with a red rule, a TO: line holding who's picked, people in sections (Recent · Communities & groups ·
 * You follow, or search results) with a red "Sending" stamp, an optional note, a red "Dispatch to N →" button, and
 * other ways to share under "Outside WebNEWS". Each person gets it in your direct chat with them; a group /
 * community in its chat. The website and the phone app share it.
 */
export function SendSheet({ open, onOpenChange, item, external }: SendSheetProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Map<string, Target>>(() => new Map());
  const q = useDebounced(text.trim().replace(/^@+/, ""));

  const suggested = useQuery({
    queryKey: qk.sendSuggestions,
    queryFn: ({ signal }) => api.messages.suggested(signal),
    staleTime: 60_000,
    enabled: open,
  });
  const search = useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => api.search(q, signal),
    enabled: open && q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const targets: Target[] = [];
  const seen = new Set<string>();
  const add = (target: Target) => {
    if (seen.has(target.key)) return;
    seen.add(target.key);
    targets.push(target);
  };
  if (q) {
    for (const u of search.data?.users ?? []) {
      if (!u.isViewer) add(personTarget({ id: u.id, username: u.username, name: u.name, image: u.image, reporterLevel: u.reporterLevel ?? null }, "Results"));
    }
  } else {
    for (const chat of suggested.data?.chats ?? []) add(chatTarget(chat));
    for (const person of suggested.data?.people ?? []) add(personTarget(person, "You follow"));
  }
  const loading = q ? search.isPending : suggested.isPending;

  const toggle = (target: Target) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(target.key)) next.delete(target.key);
      else if (next.size < CHAT_LIMITS.sendRecipientsMax) next.set(target.key, target);
      else toast.error(`Send to at most ${CHAT_LIMITS.sendRecipientsMax} at once`, { id: "send-max" });
      return next;
    });
  };

  const reset = () => {
    setPicked(new Map());
    setText("");
    setNote("");
  };

  const send = useMutation({
    mutationFn: () => {
      const list = [...picked.values()];
      return api.messages.send({
        usernames: list.flatMap((t) => (t.username ? [t.username] : [])),
        conversationIds: list.flatMap((t) => (t.conversationId ? [t.conversationId] : [])),
        text: note.trim() || undefined,
        ...(item.kind === "article" ? { articleId: item.id } : { profileUsername: item.username }),
      });
    },
    onSuccess: ({ sent }) => {
      toast.success(sent === 1 ? "Dispatched" : `Dispatched to ${sent} chats`, { id: "send-done", action: { label: "Open messages", href: "/messages" } });
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      reset();
      onOpenChange(false);
    },
    onError: (error) => toast.error("Couldn't send", { description: errorMessage(error), id: "send-error" }),
  });

  const close = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={item.kind === "article" ? "Send story" : "Send profile"}
      description={item.kind === "article" ? item.title : `${item.name} · @${item.username}`}
      hideHeader
      size="md"
      bodyClassName="flex flex-col px-0 py-0 sm:px-0"
      footer={
        <div className="flex w-full flex-col">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={CHAT_LIMITS.messageMax}
            placeholder="Add a note for them…"
            aria-label="Note"
            className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted-2 focus:border-brand"
          />
          <button
            type="button"
            disabled={picked.size === 0 || send.isPending}
            onClick={() => send.mutate()}
            className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-wide text-sm font-black uppercase tracking-wider text-brand-contrast transition-[background-color,opacity] hover:bg-brand-hover disabled:opacity-45"
          >
            {send.isPending ? (
              <SpeedLinesLoader size="sm" label="Sending" className="text-current" />
            ) : (
              <>
                <SpeedBarsSvg className="w-5 text-current" />
                {picked.size === 0 ? "Pick who gets it" : `Dispatch to ${picked.size}`}
                {picked.size > 0 && <ArrowRight aria-hidden className="size-4" />}
              </>
            )}
          </button>
          {external && (
            <>
              <p className="kicker mt-4 text-[0.625rem] text-muted">Outside WebNEWS</p>
              <div className="mt-2">{external}</div>
            </>
          )}
        </div>
      }
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
        <p className="kicker flex items-center gap-2 text-brand">
          <SpeedLines />
          Dispatch
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-mr-2 inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <Clipping item={item} />

      {/* TO: a routing slip — who's picked, then the search. */}
      <div className="mx-5 mt-4 flex flex-wrap items-center gap-1.5 border-b-2 border-ink pb-2 sm:mx-6">
        <span className="kicker mr-1 text-ink">To</span>
        {[...picked.values()].map((target) => (
          <button
            key={target.key}
            type="button"
            onClick={() => toggle(target)}
            aria-label={`Remove ${target.name}`}
            className="inline-flex max-w-40 items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-white hover:bg-brand"
          >
            <span className="truncate">{target.name.split(" ")[0]}</span>
            <X aria-hidden className="size-3 shrink-0" />
          </button>
        ))}
        <label className="flex min-w-32 flex-1 items-center gap-1.5">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && text === "" && picked.size > 0) {
                const last = [...picked.values()].at(-1);
                if (last) toggle(last);
              }
            }}
            placeholder="Find a reader or desk"
            aria-label="Search people, groups and communities"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-2"
          />
        </label>
      </div>

      <div className="max-h-[min(20rem,40dvh)] min-h-36 overflow-y-auto overscroll-contain px-5 pb-3 pt-1 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <SpeedLinesLoader size="sm" label="Loading people" />
          </div>
        ) : targets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {q ? "No one found." : "Follow people or start a chat, and they'll show up here — or search for anyone."}
          </p>
        ) : (
          SECTIONS.map((section) => {
            const rows = targets.filter((t) => t.section === section);
            if (rows.length === 0) return null;
            return (
              <div key={section} role="group" aria-label={section}>
                <p className="kicker mt-3 flex items-center gap-2 text-[0.625rem] text-muted">
                  {section}
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </p>
                {rows.map((target) => {
                  const on = picked.has(target.key);
                  return (
                    <button
                      key={target.key}
                      type="button"
                      onClick={() => toggle(target)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 rounded-lg py-2 text-left -outline-offset-2"
                    >
                      {target.avatar}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{target.name}</span>
                        <span className="flex min-w-0 text-xs text-muted">{target.sub}</span>
                      </span>
                      {/* A stamp, not a check circle. */}
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-7 shrink-0 items-center rounded-md border-2 px-2 font-wide text-[0.625rem] font-black uppercase tracking-wider transition-all duration-200",
                          on ? "-rotate-6 border-brand bg-brand text-brand-contrast" : "border-border-strong text-muted",
                        )}
                      >
                        {on ? "Sending" : "Add"}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

/** What's being sent, as a clipping with the red rule: the poster + headline, or the person. */
function Clipping({ item }: { item: SendItem }) {
  return (
    <div className="mx-5 flex items-center gap-3 rounded-xl border-l-4 border-brand bg-tint p-3 sm:mx-6">
      {item.kind === "article" ? (
        <>
          <span className="w-11 shrink-0 overflow-hidden rounded-md">
            {item.poster ? (
              <StoryPoster template={item.poster.template} story={item.poster.story} />
            ) : (
              <span className="flex aspect-9/16 w-full items-center justify-center bg-brand">
                <SpeedBarsSvg className="w-6 text-white" />
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 font-wide text-[0.9375rem] font-extrabold leading-tight text-ink">{item.title}</span>
            <span className="mt-1 block truncate text-xs font-semibold text-muted">{item.author ? `by ${item.author} · WebNEWS` : "WebNEWS story"}</span>
          </span>
        </>
      ) : (
        <>
          {/* The person, then their profile QR big and centred, the WebNEWS bars in its middle (owner 2026-10-15). */}
          <span className="flex w-full flex-col items-center gap-3">
            <span className="flex w-full min-w-0 items-center gap-3">
              <Avatar src={item.image} name={item.name} size={44} decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-wide text-[0.9375rem] font-extrabold text-ink">{item.name}</span>
                <UserHandle username={item.username} truncate className="flex text-xs font-semibold text-muted" />
              </span>
            </span>
            <ProfileQr username={item.username} size={176} />
            <span className="text-xs font-semibold text-muted">Scan to open the profile</span>
          </span>
        </>
      )}
    </div>
  );
}

/** One "Outside WebNEWS" square (copy link, WhatsApp, X…): the label is its tooltip and accessible name. */
export function ExternalShareButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong text-ink transition-colors hover:border-brand hover:text-brand [&_svg]:size-[1.05rem]"
    >
      {icon}
    </button>
  );
}
