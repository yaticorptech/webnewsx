"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { WISH_QUICK_COMMENTS, type Wish } from "@/lib/shared/contracts";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { WishCard } from "./wish-card";

export type FeedEntry<T> = { kind: "story"; item: T; index: number } | { kind: "wish"; wish: Wish };

/**
 * Where the wishes go between the stories (owner 2026-10-31: "not on top, randomly in the middle"): the first after
 * 4–7 stories, then one every 8–12, in a shuffled order. The spots are drawn once per visit, so the list doesn't jump.
 */
export function useFeedWishes() {
  const { data } = useQuery({ queryKey: qk.wishes, queryFn: ({ signal }) => api.wishes.list(signal), staleTime: 60_000 });
  const [plan] = useState(() => {
    const gaps: number[] = [];
    let at = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < 40; i++) {
      gaps.push(at);
      at += 8 + Math.floor(Math.random() * 5);
    }
    return { gaps, salt: Math.random() };
  });
  const wishes = [...(data?.items ?? [])].sort((a, b) => hash(a.id, plan.salt) - hash(b.id, plan.salt));

  /** Stories with the wishes slotted in after the planned positions. */
  function weave<T>(items: T[]): FeedEntry<T>[] {
    const out: FeedEntry<T>[] = [];
    let w = 0;
    items.forEach((item, index) => {
      out.push({ kind: "story", item, index });
      if (w < wishes.length && plan.gaps[w] === index + 1) out.push({ kind: "wish", wish: wishes[w++]! });
    });
    return out;
  }
  return { weave };
}

function hash(id: string, salt: number): number {
  let h = Math.floor(salt * 1e9);
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

/**
 * The quick wishes under a card in Home (owner 2026-10-31: "Happy birthday", "Many more happy returns of the day" — one
 * tap, no typing; not the stories' comments): the latest few with who sent them, then the choices to tap.
 */
function QuickWishes({ wish }: { wish: Wish }) {
  const queryClient = useQueryClient();
  const authPrompt = useAuthPrompt();
  const [sending, setSending] = useState<string | null>(null);
  const send = async (body: string) => {
    if (sending || !authPrompt.guard("Log in to send your wishes")) return;
    setSending(body);
    try {
      const result = await api.wishes.comment(wish.id, body);
      queryClient.setQueryData<{ items: Wish[] }>(qk.wishes, (prev) =>
        prev ? { items: prev.items.map((w) => (w.id === wish.id ? { ...w, ...result } : w)) } : prev,
      );
    } catch (error) {
      toast.error("Couldn't send it", { id: "wish-comment", description: errorMessage(error) });
    } finally {
      setSending(null);
    }
  };
  return (
    <div className="flex flex-col gap-2 px-1.5 pt-3">
      {wish.comments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {wish.comments.map((c) => (
            <li key={c.id} className="truncate text-ink-2">
              <span className="font-semibold text-ink">{c.author.name}</span> {c.body}
            </li>
          ))}
          {wish.commentCount > wish.comments.length && (
            <li className="text-xs font-semibold text-muted">+{wish.commentCount - wish.comments.length} more wishes</li>
          )}
        </ul>
      )}
      <div role="group" aria-label="Send a wish" className="no-scrollbar -mx-1.5 flex gap-2 overflow-x-auto px-1.5 pb-1">
        {WISH_QUICK_COMMENTS[wish.kind].map((body) => (
          <button
            key={body}
            type="button"
            disabled={sending !== null}
            onClick={() => void send(body)}
            className="shrink-0 rounded-full border border-tint-border bg-tint px-3 py-1.5 text-xs font-semibold text-brand-strong transition-colors hover:bg-brand hover:text-brand-contrast disabled:opacity-60"
          >
            {sending === body ? "Sending…" : body}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A wish in a feed: the card, its quick wishes, and Remove for its author / the Editor Desk. */
export function FeedWish({ wish, compact = false, className }: { wish: Wish; compact?: boolean; className?: string }) {
  const queryClient = useQueryClient();
  return (
    <WishCard
      data={wish}
      canDelete={wish.canDelete}
      className={className}
      extra={<QuickWishes wish={wish} />}
      compact={compact}
      onDelete={async () => {
        try {
          await api.wishes.remove(wish.id);
          queryClient.setQueryData<{ items: Wish[] }>(qk.wishes, (prev) =>
            prev ? { items: prev.items.filter((w) => w.id !== wish.id) } : prev,
          );
          toast.success("Removed", { id: "wish-removed" });
        } catch (error) {
          toast.error("Couldn't remove it", { id: "wish-removed", description: errorMessage(error) });
        }
      }}
    />
  );
}
