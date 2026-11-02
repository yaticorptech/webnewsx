"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { RotateCcw, UsersRound } from "lucide-react";
import Link from "next/link";
import { UserHandle, handleText } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { FollowButton } from "@/components/follow/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { UserRow } from "@/lib/shared/contracts";
import { flattenPages } from "./profile-cache";
import type { FollowListKind } from "./stats-band";
import { useInfiniteSentinel } from "./use-infinite-sentinel";

export type FollowListModalProps = {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FollowListKind;
  onKindChange: (kind: FollowListKind) => void;
  counts: { followers: number; following: number };
};

const TABS_ID = "follow-list";

/**
 * Followers / Following of a profile: dialog on ≥640px, bottom sheet below. Switchable tabs,
 * cursor-paginated user rows with infinite scroll and Follow buttons.
 */
export function FollowListModal({ username, open, onOpenChange, kind, onKindChange, counts }: FollowListModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "followers" ? "Followers" : "Following"}
      description={<UserHandle username={username} />}
      size="md"
      bodyClassName="px-0 pb-3 pt-0 sm:px-0"
      className="sm:min-h-[min(26rem,85dvh)]"
    >
      <Tabs
        id={TABS_ID}
        ariaLabel="Connections"
        value={kind}
        onValueChange={(value) => onKindChange(value === "following" ? "following" : "followers")}
        fullWidth
        items={[
          { value: "followers", label: "Followers", count: counts.followers },
          { value: "following", label: "Following", count: counts.following },
        ]}
        className="sticky top-0 z-10 mb-1 bg-surface px-5 sm:px-6"
      />
      {(["followers", "following"] as const).map((value) => (
        <TabPanel key={value} tabsId={TABS_ID} value={value} active={kind === value}>
          <FollowList username={username} kind={value} total={counts[value]} onNavigate={() => onOpenChange(false)} />
        </TabPanel>
      ))}
    </Modal>
  );
}

function FollowList({
  username,
  kind,
  total,
  onNavigate,
}: {
  username: string;
  kind: FollowListKind;
  total: number;
  onNavigate: () => void;
}) {
  const query = useInfiniteQuery({
    // Its own key under `qk.followers` / `qk.following` ("list"): the side nav keeps a plain first page under the same
    // prefix, and an infinite query must never read that ({ pages } missing → "reading 'length'").
    queryKey: [...(kind === "followers" ? qk.followers(username) : qk.following(username)), "list"],
    queryFn: ({ pageParam, signal }) =>
      kind === "followers" ? api.followers(username, pageParam, signal) : api.following(username, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = flattenPages(query.data);
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };
  const sentinel = useInfiniteSentinel<HTMLDivElement>({
    enabled: query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError,
    onReach: loadMore,
    rootMargin: "240px 0px",
  });

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading" className="flex flex-col">
        {Array.from({ length: 5 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (query.isError && rows.length === 0) {
    return (
      <EmptyState
        size="sm"
        as="p"
        title="Couldn’t load this list"
        description="Check your connection and try again."
        action={
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  // Followers counted but not listed (demo followers while demo mode is on): a summary row instead of "No followers yet".
  const unlisted = kind === "followers" && !query.hasNextPage ? Math.max(0, total - rows.length) : 0;

  if (rows.length === 0 && unlisted === 0) {
    return (
      <EmptyState
        size="sm"
        as="p"
        icon={<UsersRound aria-hidden />}
        title={kind === "followers" ? "No followers yet" : "Not following anyone yet"}
        description={
          kind === "followers"
            ? `When people follow ${handleText(username)}, they’ll show up here.`
            : `Publishers ${handleText(username)} follows will show up here.`
        }
      />
    );
  }

  return (
    <div aria-busy={query.isFetchingNextPage || undefined}>
      <ul aria-label={kind === "followers" ? `Followers of ${handleText(username)}` : `Accounts ${handleText(username)} follows`}>
        {rows.map((row) => (
          <UserRowItem key={row.id} row={row} onNavigate={onNavigate} />
        ))}
        {unlisted > 0 && <MoreReaders count={unlisted} more={rows.length > 0} username={username} />}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      {query.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <SpeedLinesLoader size="sm" label="Loading more" />
        </div>
      )}
      {query.isFetchNextPageError && (
        <div role="alert" className="flex justify-center py-4">
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function UserRowItem({ row, onNavigate }: { row: UserRow; onNavigate: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-6" data-testid="follow-row">
      <Link
        href={`/${row.username}`}
        onClick={onNavigate}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md outline-offset-2"
      >
        <Avatar src={row.image} name={row.name} size="md" decorative />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-ink transition-colors group-hover:text-brand">{row.name}</span>
            {row.reporterLevel === "verified" && <VerifiedBadge size={16} focusable={false} />}
            {row.isViewer && (
              <span className="shrink-0 rounded-full bg-tint px-2 py-px text-[0.625rem] font-bold uppercase tracking-[0.12em] text-brand ring-1 ring-tint-border ring-inset">
                You
              </span>
            )}
          </span>
          <UserHandle username={row.username} truncate className="flex text-xs text-muted" />
          {row.bio && <span className="mt-0.5 line-clamp-1 text-xs text-muted">{row.bio}</span>}
        </span>
      </Link>
      {!row.isViewer && (
        <FollowButton username={row.username} initialFollowing={row.viewerFollows} size="sm" />
      )}
    </li>
  );
}

/** "+76 readers": followers that are counted but have no row to show. */
function MoreReaders({ count, more, username }: { count: number; more: boolean; username: string }) {
  return (
    <li className="flex items-center gap-3 px-5 py-4 sm:px-6" data-testid="follow-more">
      <span aria-hidden className="flex shrink-0 -space-x-3">
        {["bg-tint text-brand", "bg-surface-2 text-muted", "bg-tint-border/60 text-brand"].map((tone, i) => (
          <span key={i} className={`grid size-10 place-items-center rounded-full ring-2 ring-surface ${tone}`}>
            <UsersRound className="size-4.5" />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">
          {more ? "and " : ""}
          {formatNumber(count)} {more ? "more " : ""}
          {count === 1 ? "reader" : "readers"}
        </span>
        <span className="block text-xs text-muted">Following {handleText(username)} for their stories</span>
      </span>
    </li>
  );
}

function RowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 sm:px-6">
      <Skeleton shape="circle" className="size-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton shape="pill" className="h-3 w-32 max-w-full" />
        <Skeleton shape="pill" className="h-2.5 w-20" />
      </div>
      <Skeleton shape="pill" className="h-8 w-24" />
    </div>
  );
}
