"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useViewer } from "@/components/providers/viewer-provider";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, type LikeResult } from "@/lib/api";
import type { ArticleCard } from "@/lib/shared/contracts";
import { likeKey, setStats, statsKey, type StatCounts } from "./live-state";

type LikeSource = Pick<ArticleCard, "id" | "likeCount"> & { viewer: Pick<ArticleCard["viewer"], "liked"> };

export type LikeApi = {
  liked: boolean;
  pending: boolean;
  /** Increments on every like (not unlike): remount keys for the pop/burst animations. */
  burst: number;
  toggle: () => void;
  /** Like only (double-tap on the cover never unlikes). */
  like: () => void;
};

/*
 * Anyone can like (owner 2026-09-28): logged-out visitors like as their browser (the server's anonymous id). Story
 * cards only know an account's own likes, so a visitor's liked stories are remembered here, per browser.
 */
const ANON_LIKES = "webnews:anon-likes";
const ANON_LIKES_MAX = 500;

function readAnonLikes(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ANON_LIKES) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberAnonLike(articleId: string, liked: boolean) {
  try {
    const ids = readAnonLikes().filter((id) => id !== articleId);
    if (liked) ids.push(articleId);
    localStorage.setItem(ANON_LIKES, JSON.stringify(ids.slice(-ANON_LIKES_MAX)));
  } catch {
    // Storage blocked (private mode): the like still counts, the heart just won't stay filled after a reload.
  }
}

/**
 * Like state for one article, shared by every like control for it (feed card, cover double-tap,
 * article page). Optimistic: the heart and count flip immediately, the server result then wins;
 * failures roll back. No account needed. `enabled: false` (preview) makes it inert.
 */
export function useLike(article: LikeSource, enabled = true): LikeApi {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  const key = likeKey(article.id, viewer?.id ?? null);
  const [burst, setBurst] = useState(0);

  const { data: liked = article.viewer.liked } = useQuery({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<boolean>(key) ?? article.viewer.liked,
    initialData: article.viewer.liked,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled,
  });

  // A visitor's earlier likes (after hydration: the server-rendered heart is always empty for them).
  useEffect(() => {
    if (viewer || !enabled || article.viewer.liked) return;
    if (queryClient.getQueryData<boolean>(key) === false && readAnonLikes().includes(article.id)) queryClient.setQueryData(key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key follows viewer + article.id
  }, [viewer, enabled, article.id, article.viewer.liked, queryClient]);

  const mutationKey = ["like", article.id] as const;
  const mutation = useMutation<LikeResult, unknown, boolean, { liked: boolean; stats: StatCounts | undefined }>({
    mutationKey,
    // Rapid toggles apply optimistically at once but reach the server one after another, in order.
    scope: { id: `like-${article.id}` },
    mutationFn: (next) => (next ? api.like(article.id) : api.unlike(article.id)),
    onMutate: async (next) => {
      const previousLiked = queryClient.getQueryData<boolean>(key) ?? article.viewer.liked;
      const previousStats = queryClient.getQueryData<StatCounts>(statsKey(article.id));
      queryClient.setQueryData(key, next);
      if (previousLiked !== next && previousStats) {
        setStats(queryClient, article.id, { likeCount: Math.max(0, previousStats.likeCount + (next ? 1 : -1)) });
      }
      return { liked: previousLiked, stats: previousStats };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(key, context?.liked ?? article.viewer.liked);
      if (context?.stats) queryClient.setQueryData(statsKey(article.id), context.stats);
      toast.error("Couldn't update your like", { description: errorMessage(error), id: `like-${article.id}` });
    },
    onSuccess: (result) => {
      // A newer toggle is still queued: its optimistic state wins until it settles.
      if (!viewer) rememberAnonLike(article.id, result.liked);
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      queryClient.setQueryData(key, result.liked);
      setStats(queryClient, article.id, { likeCount: result.likeCount });
    },
  });

  const run = (next: boolean) => {
    if (!enabled) return;
    if (authPrompt.adminVisit) {
      authPrompt.open();
      return;
    }
    if (next) setBurst((n) => n + 1);
    if (next === liked) return;
    mutation.mutate(next);
  };

  return {
    liked,
    pending: mutation.isPending,
    burst,
    toggle: () => run(!liked),
    like: () => run(true),
  };
}
