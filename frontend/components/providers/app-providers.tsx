"use client";

import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthPromptProvider } from "@/components/layout/auth-prompt";
import { PremiumGate } from "@/components/feed/premium-gate";
import { UnfollowConfirm } from "@/components/follow/unfollow-confirm";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { NotificationToasts } from "@/components/notifications/notification-toasts";
import { Toaster } from "@/components/ui/toast";
import { useNavigationDepth } from "@/lib/nav-history";
import { installTapTracking, trackPageViews } from "@/lib/track";
import { useNativeBackButton, useNativeLinkOpen } from "@/lib/native-back";
import { useNativePush } from "@/lib/native-push";
import type { ViewerUser } from "@/lib/shared/contracts";
import { PhoneHintProvider } from "./phone-layout-provider";
import { QueryProvider } from "./query-provider";
import { RealtimeProvider } from "./realtime-provider";
import { ViewerProvider } from "./viewer-provider";

/**
 * Every client-side provider, mounted once by the root layout. MotionConfig "user" makes all
 * motion/react animations honour prefers-reduced-motion (transforms are skipped).
 */
export function AppProviders({ viewer, phone, children }: { viewer: ViewerUser | null; phone: boolean; children: ReactNode }) {
  useHydratedMarker();
  // In-app history depth for the back arrows (lib/nav-history.ts).
  useNavigationDepth();
  // The app's push notifications: permission popup on open, this phone registered for the viewer (lib/native-push.ts).
  useNativePush(viewer?.id ?? null);
  // The phone's Back button in the app: Home leaves the app (lib/native-back.ts).
  useNativeBackButton();
  useNativeLinkOpen();
  // Every tap on a button or link, recorded with the viewer (lib/track.ts, owner 2026-10-16).
  useEffect(() => installTapTracking(), []);
  // Each page opened, and "still here" while it's on screen (Desk → Live now).
  const pathname = usePathname();
  useEffect(() => trackPageViews(pathname), [pathname]);
  return (
    <MotionConfig reducedMotion="user">
      <PhoneHintProvider phone={phone}>
        <QueryProvider>
          <ViewerProvider viewer={viewer}>
            <RealtimeProvider>
              <AuthPromptProvider>
                {children}
                <Toaster />
                {/* The important notifications as popups, on every page — the press meet room too (owner 2026-10-08). */}
                <NotificationToasts />
                <PullToRefresh />
                {/* "Unfollow @name?" for every Following button (owner 2026-10-14). */}
                <UnfollowConfirm />
                <PremiumGate />
              </AuthPromptProvider>
            </RealtimeProvider>
          </ViewerProvider>
        </QueryProvider>
      </PhoneHintProvider>
    </MotionConfig>
  );
}

/**
 * Sets `<html data-hydrated>` once the initial tree has hydrated (parent effects run after all
 * child effects of the same commit). E2E tests wait for it before clicking, so clicks never land
 * on server HTML whose handlers aren't attached yet. <html> has suppressHydrationWarning.
 */
function useHydratedMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
  }, []);
}
