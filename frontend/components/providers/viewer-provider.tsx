"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { qk } from "@/lib/query-keys";
import type { ViewerUser } from "@/lib/shared/contracts";

/**
 * The server-resolved viewer (GET /api/me in the root layout), available to client components.
 * After login/logout call `router.refresh()` so the root layout re-renders with the new value.
 */
const ViewerContext = createContext<ViewerUser | null>(null);

/** Prefix of every "viewer follows <username>" override (not viewer-scoped in its key). */
const FOLLOW_STATE_PREFIX = [qk.followState("")[0]] as const;

export function ViewerProvider({ viewer, children }: { viewer: ViewerUser | null; children: ReactNode }) {
  useResetViewerScopedCache(viewer?.id ?? null);
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

/**
 * When the signed-in account changes without a full reload (log in / log out / switch), drop the
 * follow-state overrides cached for the previous viewer so every FollowButton falls back to the
 * fresh server value (its `initialFollowing`).
 */
function useResetViewerScopedCache(viewerId: string | null) {
  const queryClient = useQueryClient();
  const previous = useRef(viewerId);
  useEffect(() => {
    if (previous.current === viewerId) return;
    previous.current = viewerId;
    void queryClient.resetQueries({ queryKey: FOLLOW_STATE_PREFIX });
  }, [viewerId, queryClient]);
}

/** Current viewer or null when logged out. */
export function useViewer(): ViewerUser | null {
  return useContext(ViewerContext);
}
