"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { likeKey, setStats } from "@/components/feed/live-state";
import type { LikeApi } from "@/components/feed/use-like";
import { useViewer } from "@/components/providers/viewer-provider";
import { NumberTicker } from "@/components/ui/number-ticker";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * 👍 / 👎 inside a story (owner 2026-10-16: in place of the heart, only on the story page — cards keep the heart).
 * 👍 is the like itself (same state and count as every heart for this story); 👎 is a dislike. One replaces the other.
 * Both counts show. A visitor's dislikes are remembered in this browser (the server knows them by the anonymous id).
 */

const ANON_DISLIKES = "webnews:anon-dislikes";
const readAnonDislikes = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(ANON_DISLIKES) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const rememberAnonDislike = (id: string, on: boolean) => {
  try {
    const list = readAnonDislikes().filter((x) => x !== id);
    localStorage.setItem(ANON_DISLIKES, JSON.stringify(on ? [id, ...list].slice(0, 500) : list));
  } catch {
    // not remembered
  }
};

const noopSubscribe = () => () => {};

const BUTTON =
  "relative inline-flex h-10 items-center gap-2 px-3.5 text-sm font-bold tabular-nums transition-colors duration-150 active:scale-95 motion-reduce:active:scale-100 after:absolute after:-inset-1 after:content-['']";

export function ThumbsVote({
  articleId,
  like,
  likeCount,
  initialDislikes,
  initialDisliked,
}: {
  articleId: string;
  like: LikeApi;
  likeCount: number;
  initialDislikes: number;
  initialDisliked: boolean;
}) {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  // A visitor's earlier 👎 in this browser — read after hydration (the server can't know it), so both renders agree.
  const anonDisliked = useSyncExternalStore(
    noopSubscribe,
    () => !viewer && readAnonDislikes().includes(articleId),
    () => false,
  );
  const [choice, setDisliked] = useState<boolean | null>(null);
  const disliked = choice ?? (initialDisliked || anonDisliked);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [pop, setPop] = useState(0);

  const mutation = useMutation({
    mutationFn: (next: boolean) => api.dislike(articleId, next),
    onSuccess: (result) => {
      setDisliked(result.disliked);
      setDislikes(result.dislikeCount);
      if (!viewer) rememberAnonDislike(articleId, result.disliked);
      // Disliking took the like back: every heart / 👍 for this story agrees.
      if (result.liked !== null && result.likeCount !== null) {
        queryClient.setQueryData(likeKey(articleId, viewer?.id ?? null), result.liked);
        setStats(queryClient, articleId, { likeCount: result.likeCount });
      }
    },
    onError: (error, next) => {
      setDisliked(!next);
      setDislikes((n) => Math.max(0, n + (next ? -1 : 1)));
      toast.error("Couldn't update your vote", { description: errorMessage(error) });
    },
  });

  const onUp = () => {
    // A like replaces a dislike (the server takes it back too).
    if (!like.liked && disliked) {
      setDisliked(false);
      setDislikes((n) => Math.max(0, n - 1));
      if (!viewer) rememberAnonDislike(articleId, false);
    }
    like.toggle();
  };

  const onDown = () => {
    if (authPrompt.adminVisit) {
      authPrompt.open();
      return;
    }
    if (mutation.isPending) return;
    const next = !disliked;
    setDisliked(next);
    setDislikes((n) => Math.max(0, n + (next ? 1 : -1)));
    if (next) {
      setPop((n) => n + 1);
      if (like.liked) {
        queryClient.setQueryData(likeKey(articleId, viewer?.id ?? null), false);
        setStats(queryClient, articleId, { likeCount: Math.max(0, likeCount - 1) });
      }
    }
    mutation.mutate(next);
  };

  return (
    <div role="group" aria-label="Rate this story" className="inline-flex items-center rounded-full bg-surface-2">
      <button
        type="button"
        onClick={onUp}
        aria-pressed={like.liked}
        aria-label={`Like · ${formatNumber(likeCount)}`}
        className={cn(BUTTON, "rounded-l-full pl-4", like.liked ? "text-brand" : "text-ink-2 hover:text-brand")}
      >
        <motion.span
          key={like.burst}
          className="inline-flex"
          initial={like.burst > 0 ? { scale: 0.55, rotate: -18 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 14, mass: 0.6 }}
        >
          <ThumbsUp aria-hidden className={cn("size-5", like.liked && "fill-brand")} strokeWidth={2} />
        </motion.span>
        <NumberTicker value={likeCount} />
      </button>
      <span aria-hidden className="h-6 w-px bg-border-strong" />
      <button
        type="button"
        onClick={onDown}
        aria-pressed={disliked}
        aria-label={`Dislike · ${formatNumber(dislikes)}`}
        className={cn(BUTTON, "rounded-r-full pr-4", disliked ? "text-ink" : "text-ink-2 hover:text-ink")}
      >
        <motion.span
          key={pop}
          className="inline-flex"
          initial={pop > 0 ? { scale: 0.55, rotate: 18 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 14, mass: 0.6 }}
        >
          <ThumbsDown aria-hidden className={cn("size-5", disliked && "fill-ink")} strokeWidth={2} />
        </motion.span>
        <NumberTicker value={dislikes} />
      </button>
    </div>
  );
}
