"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkX, Compass } from "lucide-react";
import { useState } from "react";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ArticleCard, Page } from "@/lib/shared/contracts";
import { ProfileGrid } from "./article-grid";
import { ArticleTile } from "./article-tile";
import { flattenPages, patchStats, removeItem, toPages, type Pages } from "./profile-cache";

/** The viewer's Saved list (infinite, cursor-paginated). `enabled` = own profile. */
export function useSavedStories(initial: Page<ArticleCard> | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.saved,
    queryFn: ({ pageParam, signal }) => api.saved(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: initial ? toPages(initial) : undefined,
    enabled,
  });
}

export type SavedGridProps = {
  saved: ReturnType<typeof useSavedStories>;
};

const EAGER_TILES = 6;

/**
 * "Saved" tab (SPEC §3.11) — the viewer's own "Save for later" list, most recently saved first.
 * Each tile has a remove control (with Undo); live counts and removals follow the realtime stream.
 */
export function SavedGrid({ saved }: SavedGridProps) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());
  const items = flattenPages(saved.data);

  useRealtimeEvent("article.stats", (stats) => {
    queryClient.setQueryData<Pages<ArticleCard>>(qk.saved, (data) => patchStats(data, stats));
  });
  useRealtimeEvent("article.deleted", ({ id }) => {
    queryClient.setQueryData<Pages<ArticleCard>>(qk.saved, (data) => removeItem(data, id));
  });
  useRealtimeReconnect(() => void queryClient.invalidateQueries({ queryKey: qk.saved }));

  const setSaveState = (id: string, value: boolean) => queryClient.setQueriesData({ queryKey: qk.saveState(id) }, value);

  const unsave = async (article: ArticleCard) => {
    setRemoving((ids) => new Set(ids).add(article.id));
    try {
      await api.unsave(article.id);
      queryClient.setQueryData<Pages<ArticleCard>>(qk.saved, (data) => removeItem(data, article.id));
      setSaveState(article.id, false);
      toast("Removed from Saved", {
        id: `unsaved-${article.id}`,
        description: article.title,
        action: {
          label: "Undo",
          onClick: () => {
            void api
              .save(article.id)
              .then(() => {
                setSaveState(article.id, true);
                return queryClient.invalidateQueries({ queryKey: qk.saved });
              })
              .catch((error: unknown) => toast.error("Couldn't save it again", { description: errorMessage(error) }));
          },
        },
      });
    } catch (error) {
      toast.error("Couldn't remove it", { description: errorMessage(error) });
    } finally {
      setRemoving((ids) => {
        const next = new Set(ids);
        next.delete(article.id);
        return next;
      });
    }
  };

  return (
    <ProfileGrid
      label="Saved stories"
      items={items}
      renderItem={(article, index) => (
        <div className="relative h-full" data-testid="saved-tile">
          <ArticleTile article={article} priority={index < EAGER_TILES} menuAlign={index % 3 === 0 ? "start" : "end"} />
          <button
            type="button"
            onClick={() => void unsave(article)}
            disabled={removing.has(article.id)}
            aria-label={`Remove “${article.title}” from Saved`}
            title="Remove from Saved"
            className="group/unsave absolute right-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-full bg-surface/95 text-brand shadow-card backdrop-blur-sm transition-[transform,background-color,color] duration-150 hover:bg-brand hover:text-brand-contrast active:scale-95 disabled:opacity-60 sm:right-2.5 sm:top-2.5"
          >
            <Bookmark aria-hidden className="size-4 fill-current group-hover/unsave:hidden" />
            <BookmarkX aria-hidden className="hidden size-4 group-hover/unsave:block" />
          </button>
        </div>
      )}
      hasNextPage={saved.hasNextPage}
      isFetchingNextPage={saved.isFetchingNextPage}
      isError={saved.isFetchNextPageError || (saved.isError && items.length === 0)}
      onLoadMore={() => void (saved.isError && items.length === 0 ? saved.refetch() : saved.fetchNextPage())}
      empty={
        <EmptyState
          icon={<Bookmark aria-hidden />}
          kicker="Saved"
          title="Nothing saved yet"
          description="Tap the bookmark on any story to keep it here for later. Only you can see your Saved list."
          action={
            <Button href="/" leftIcon={<Compass aria-hidden />}>
              Browse the feed
            </Button>
          }
        />
      }
    />
  );
}
