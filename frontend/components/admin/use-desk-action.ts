"use client";

import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast, type ToastAction } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { restoreLists } from "./use-desk-list";

type Snapshot = [QueryKey, unknown][];

export type DeskActionOptions<TVars, TResult> = {
  run: (vars: TVars) => Promise<TResult>;
  /** Optimistic cache edit (usually `patchLists`); its snapshot is restored if the call fails. */
  optimistic?: (client: QueryClient, vars: TVars) => Snapshot | void;
  /** Success toast. Return null for no toast. */
  success?: (result: TResult, vars: TVars) => { title: string; description?: string; action?: ToastAction } | null;
  /** Error toast title (the API's message becomes the description). */
  errorTitle: string | ((vars: TVars) => string);
  onDone?: (result: TResult, vars: TVars) => void;
};

/**
 * One Editor Desk action: optimistic update → API call → success toast (optionally with Undo) or
 * rollback + error toast, then every desk query refetches (lists, overview counts, audit log).
 */
export function useDeskAction<TVars, TResult>({ run, optimistic, success, errorTitle, onDone }: DeskActionOptions<TVars, TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (vars: TVars) => {
      if (!optimistic) return { snapshot: [] as Snapshot };
      await client.cancelQueries({ queryKey: qk.adminAll });
      return { snapshot: optimistic(client, vars) ?? [] };
    },
    onError: (error, vars, context) => {
      if (context?.snapshot.length) restoreLists(client, context.snapshot);
      toast.error(typeof errorTitle === "function" ? errorTitle(vars) : errorTitle, { description: errorMessage(error) });
    },
    onSuccess: (result, vars) => {
      const message = success?.(result, vars);
      if (message) toast.success(message.title, { description: message.description, action: message.action, duration: message.action ? 8000 : undefined });
      onDone?.(result, vars);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.adminAll });
      // Moderation changes what the public feeds show; drop their caches too.
      void client.invalidateQueries({ queryKey: qk.feedAll });
    },
  });
}
