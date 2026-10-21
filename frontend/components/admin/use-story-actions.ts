"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AdminStoryRow, StoryStatus } from "@/lib/shared/contracts";
import { useDeskAction } from "./use-desk-action";
import { patchLists } from "./use-desk-list";

const STORIES = ["admin", "stories"] as const;
const title = (story: AdminStoryRow) => `“${story.title || "Untitled story"}”`;

function patchStory(client: Parameters<typeof patchLists>[0], id: string, update: (story: AdminStoryRow) => AdminStoryRow | null) {
  return patchLists<AdminStoryRow>(client, STORIES, (s) => s.id === id, update);
}

/** Runs an "Undo" from a toast: calls the API, confirms, and refreshes every desk list. */
export function useUndo() {
  const client = useQueryClient();
  return useCallback(
    async (run: () => Promise<unknown>, done: string) => {
      try {
        await run();
        toast(done);
      } catch (error) {
        toast.error("Couldn't undo", { description: errorMessage(error) });
      } finally {
        void client.invalidateQueries({ queryKey: qk.adminAll });
        void client.invalidateQueries({ queryKey: qk.feedAll });
      }
    },
    [client],
  );
}

/**
 * Story moderation for the Stories screen (and anywhere a story row is shown): optimistic row
 * updates, success toasts with Undo for the reversible ones (hide ⇄ unhide, pin ⇄ unpin).
 */
export function useStoryActions() {
  const client = useQueryClient();
  const undo = useUndo();
  const setPins = (items: AdminStoryRow[]) => client.setQueryData(qk.adminPins, { items });
  const withStatus = (status: StoryStatus, extra: Partial<AdminStoryRow> = {}) => (story: AdminStoryRow): AdminStoryRow => ({
    ...story,
    status,
    ...extra,
  });

  const hide = useDeskAction({
    run: ({ story, reason }: { story: AdminStoryRow; reason: string }) => api.admin.hide(story.id, reason),
    optimistic: (c, { story, reason }) => patchStory(c, story.id, withStatus("hidden", { hiddenReason: reason, editorsPick: false, pinOrder: null })),
    success: (_r, { story }) => ({
      title: "Story hidden",
      description: `${title(story)} is off every public feed. The reporter still sees it.`,
      action: { label: "Undo", onClick: () => void undo(() => api.admin.unhide(story.id), "Story is visible again") },
    }),
    errorTitle: "Couldn't hide the story",
  });

  const unhide = useDeskAction({
    run: ({ story }: { story: AdminStoryRow }) => api.admin.unhide(story.id),
    optimistic: (c, { story }) => patchStory(c, story.id, withStatus("published", { hiddenReason: null })),
    success: (_r, { story }) => ({
      title: "Story visible again",
      description: `${title(story)} is back in the feeds.`,
      action: {
        label: "Undo",
        onClick: () => void undo(() => api.admin.hide(story.id, story.hiddenReason || "Hidden by the Editor Desk"), "Story hidden again"),
      },
    }),
    errorTitle: "Couldn't restore the story",
  });

  const pin = useDeskAction({
    run: ({ story }: { story: AdminStoryRow }) => api.admin.pin(story.id),
    optimistic: (c, { story }) => patchStory(c, story.id, (s) => ({ ...s, editorsPick: true })),
    success: (result, { story }) => {
      setPins(result.items);
      return {
        title: "Editor's Pick added",
        description: `${title(story)} now leads the first page of For You and Latest.`,
        action: { label: "Undo", onClick: () => void undo(() => api.admin.unpin(story.id), "Editor's Pick removed") },
      };
    },
    errorTitle: "Couldn't pin the story",
  });

  const unpin = useDeskAction({
    run: ({ story }: { story: AdminStoryRow }) => api.admin.unpin(story.id),
    optimistic: (c, { story }) => {
      const previous = client.getQueryData<{ items: AdminStoryRow[] }>(qk.adminPins);
      if (previous) setPins(previous.items.filter((s) => s.id !== story.id));
      const snapshot = patchStory(c, story.id, (s) => ({ ...s, editorsPick: false, pinOrder: null }));
      return previous ? [...snapshot, [qk.adminPins, previous] as [readonly unknown[], unknown]] : snapshot;
    },
    success: (result, { story }) => {
      setPins(result.items);
      return {
        title: "Removed from Editor's Picks",
        description: title(story),
        action: { label: "Undo", onClick: () => void undo(() => api.admin.pin(story.id), "Editor's Pick restored") },
      };
    },
    errorTitle: "Couldn't unpin the story",
  });

  const unpublish = useDeskAction({
    run: ({ story, reason }: { story: AdminStoryRow; reason: string }) => api.admin.unpublish(story.id, reason || undefined),
    optimistic: (c, { story, reason }) =>
      patchStory(c, story.id, withStatus("returned", { reviewNote: reason || "Unpublished by the Editor Desk", editorsPick: false, pinOrder: null, publishedAt: null })),
    success: (_r, { story }) => ({ title: "Story unpublished", description: `${title(story)} went back to the reporter's drafts.` }),
    errorTitle: "Couldn't unpublish the story",
  });

  const remove = useDeskAction({
    run: ({ story, reason }: { story: AdminStoryRow; reason: string }) => api.admin.deleteStory(story.id, reason || undefined),
    optimistic: (c, { story }) => patchStory(c, story.id, () => null),
    success: (_r, { story }) => ({ title: "Story deleted", description: `${title(story)} is gone for good.` }),
    errorTitle: "Couldn't delete the story",
  });

  return { hide, unhide, pin, unpin, unpublish, remove };
}
