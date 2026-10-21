"use client";

import { useAdminVisit } from "@/components/layout/admin-visit";
import { useViewer } from "@/components/providers/viewer-provider";

/** Signed in with a finished profile (and not an admin browsing as a visitor): may send messages. */
export function useCanMessage(): boolean {
  const viewer = useViewer();
  const adminVisit = useAdminVisit();
  return Boolean(viewer?.onboarded && viewer.username) && !adminVisit;
}
