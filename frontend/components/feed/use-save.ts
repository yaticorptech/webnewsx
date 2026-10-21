"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useViewer } from "@/components/providers/viewer-provider";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ArticleCard, SaveResult } from "@/lib/shared/contracts";

type SaveSource = Pick<ArticleCard, "id"> & { viewer: Pick<ArticleCard["viewer"], "saved"> };

export type SaveApi = {
  saved: boolean;
  pending: boolean;
  toggle: () => void;
};

const LOGIN_REASON = "Log in to save stories for later";

/** "viewer saved <articleId>" per viewer (a login/logout never shows another session's bookmarks). */
export const saveKey = (articleId: string, viewerId: string | null) => [...qk.saveState(articleId), viewerId ?? "anon"] as const;

/**
 * "Save for later" state for one story, shared by every bookmark control for it (feed card, article
 * page). Optimistic like likes: flips at once, requests reach the server in order, failures roll back.
 * Logged out → auth prompt. Saving refreshes the viewer's "Saved" tab.
 */
export function useSave(article: SaveSource, enabled = true): SaveApi {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  const key = saveKey(article.id, viewer?.id ?? null);
  const initial = article.viewer.saved ?? false;

  const { data: saved = initial } = useQuery({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<boolean>(key) ?? initial,
    initialData: initial,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled,
  });

  const mutationKey = ["save", article.id] as const;
  const mutation = useMutation<SaveResult, unknown, boolean, { saved: boolean }>({
    mutationKey,
    scope: { id: `save-${article.id}` },
    mutationFn: (next) => (next ? api.save(article.id) : api.unsave(article.id)),
    onMutate: (next) => {
      const previous = queryClient.getQueryData<boolean>(key) ?? initial;
      queryClient.setQueryData(key, next);
      return { saved: previous };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(key, context?.saved ?? initial);
      if (isApiError(error) && error.isUnauthorized) {
        authPrompt.open(LOGIN_REASON);
        return;
      }
      toast.error("Couldn't update your saved stories", { description: errorMessage(error), id: `save-${article.id}` });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.saved });
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      queryClient.setQueryData(key, result.saved);
      if (result.saved) {
        toast.success("Saved for later", {
          id: "story-saved",
          description: "Find it any time in the Saved tab on your profile.",
          action: viewer?.username ? { label: "View saved", href: `/${viewer.username}?tab=saved` } : undefined,
        });
      } else {
        toast("Removed from saved", { id: "story-saved" });
      }
    },
  });

  return {
    saved,
    pending: mutation.isPending,
    toggle: () => {
      if (!enabled) return;
      if (!authPrompt.guard(LOGIN_REASON)) return;
      mutation.mutate(!saved);
    },
  };
}
