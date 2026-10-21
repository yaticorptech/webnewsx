"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, FilePlus2, PenLine } from "lucide-react";
import { ProfileGrid } from "@/components/profile/article-grid";
import { DraftTile } from "@/components/profile/article-tile";
import { flattenPages } from "@/components/profile/profile-cache";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { canPublish } from "@/lib/shared/contracts";

const EAGER_TILES = 6;

/**
 * Drafts inside Settings (owner 2026-10-09: in the app, Drafts moved here from the profile's tabs): the viewer's
 * drafts, stories waiting at the Review Desk and stories returned with a note — the same tiles and pages as the
 * profile's Drafts tab (shared query, so a draft saved in the composer shows up here too).
 */
export function DraftsCard() {
  const viewer = useViewer();
  const username = viewer?.onboarded ? viewer.username : null;
  const reporter = viewer !== null && canPublish(viewer);
  const trainee = viewer?.reporterLevel === "trainee";
  const drafts = useInfiniteQuery({
    queryKey: qk.userDrafts(username ?? ""),
    queryFn: ({ pageParam, signal }) => api.userDrafts(username ?? "", pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: username !== null,
  });
  const items = flattenPages(drafts.data);

  return (
    <section aria-labelledby="settings-drafts" className="card px-4 py-5 sm:px-8 sm:py-6">
      <h2 id="settings-drafts" className="font-wide text-lg font-extrabold text-ink">
        Drafts
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {trainee
          ? "Drafts, stories waiting at the Review Desk and stories returned with a note. Only you can see them."
          : "Stories you saved from the composer. Only you can see them."}
      </p>
      <div className="mt-5">
        {drafts.isPending && username ? (
          <SpeedLinesLoader size="sm" label="Loading your drafts" className="mx-auto my-8" />
        ) : (
          <ProfileGrid
            label="Your drafts and stories in review"
            items={items}
            renderItem={(draft, index) => <DraftTile draft={draft} priority={index < EAGER_TILES} />}
            hasNextPage={drafts.hasNextPage}
            isFetchingNextPage={drafts.isFetchingNextPage}
            isError={drafts.isFetchNextPageError}
            onLoadMore={() => void drafts.fetchNextPage()}
            empty={
              <EmptyState
                icon={<FilePlus2 aria-hidden />}
                kicker="Drafts"
                title="Your desk is clear"
                description={
                  trainee
                    ? "Drafts, stories waiting at the Review Desk and stories returned with a note all land here."
                    : "Save a draft from the composer and pick it up here whenever you’re ready."
                }
                action={
                  reporter ? (
                    <Button href="/publish" leftIcon={<PenLine aria-hidden />}>
                      Start writing
                    </Button>
                  ) : (
                    <Button href="/press-pass" rightIcon={<ArrowRight aria-hidden />}>
                      Get your Press Pass
                    </Button>
                  )
                }
              />
            }
          />
        )}
      </div>
    </section>
  );
}
