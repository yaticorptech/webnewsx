import type { ReactNode } from "react";
import { ReadWallHost } from "@/components/auth/read-wall";
import { AdminVisit } from "@/components/layout/admin-visit";
import { PageBack } from "@/components/layout/back-button";
import { PendingPage } from "@/components/layout/pending-page";
import { PressPassNudge } from "@/components/layout/press-pass-nudge";
import { PressPassWelcome } from "@/components/layout/press-pass-welcome";
import { BackToTop } from "@/components/layout/back-to-top";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { GetAppBanner } from "@/components/layout/get-app-banner";
import { HomeOnly } from "@/components/layout/home-only";
import { RightRail } from "@/components/layout/right-rail";
import { SideNav } from "@/components/layout/side-nav";
import { Masthead } from "@/components/layout/top-nav";
import { NoticeBanner } from "@/components/notices/notices";
import { FeedLayoutProvider } from "@/components/providers/feed-layout-provider";
import { getFeedLayout } from "@/lib/feed-layout-server";
import { redirectIfNeedsOnboarding } from "@/lib/session";

/**
 * App shell (redesign 2026-10-07, Instagram / Facebook / YouTube): the top bar (+ the category chips on the feeds),
 * the side menu ≥1024px, a centred ~640px column (full width for grids), the sticky right column ≥1280px on the feeds
 * (Trending now, Reporters to follow), the bottom tab bar on <768px and the back-to-top button. Every page but the home feed opens with the back arrow.
 * Logged-in users who haven't finished onboarding are redirected server-side (§3.1). An admin ("Visit site" from
 * the Editor Desk) sees the site exactly as a logged-out visitor does, with an "Admin panel" button instead of the
 * account menu (owner rule 2026-09-25). A tapped link shows its page's skeleton at once (PendingPage).
 */
export default async function MainLayout({ children }: { children: ReactNode }) {
  const [viewer, layout] = await Promise.all([redirectIfNeedsOnboarding(), getFeedLayout()]);
  const adminVisit = viewer?.role === "admin";

  const shell = (
    <>
      <Masthead viewer={adminVisit ? null : viewer} adminVisit={adminVisit} />
      {/* ≥1024px the side menu on the left (redesign 2026-10-07), then the page column — full width for grids — and,
          on the feeds from 1280px, the right column. */}
      <div className="flex w-full">
        <SideNav />
        {/* overflow-x-clip: content a few px too wide must never widen the page — on phones Chrome then widens the
            layout and the fixed bottom bar slides sideways (owner 2026-10-01). Clip (not hidden) keeps sticky working. */}
        <div className="flex min-w-0 flex-1 justify-center gap-8 overflow-x-clip px-4 pt-3 sm:px-6 md:pt-4 lg:px-8 2xl:gap-10 2xl:px-10">
          <main
            id="main"
            tabIndex={-1}
            // Grids (data-grid-page: Home, categories, Search, profiles — like YouTube) use the full width; story pages
            // with their comments panel (data-wide-page) up to 1500px; forms keep a readable column. Messages ≥1024px
            // (data-messages-page) fill the screen: chat list beside the open chat.
            className="w-full min-w-0 max-w-160 pb-tabbar outline-none has-[[data-grid-page]]:max-w-none md:pb-16 lg:has-[[data-messages-page]]:max-w-none lg:has-[[data-messages-page]]:pb-4 xl:has-[[data-wide-page]]:max-w-375"
          >
            <NoticeBanner />
            <PageBack />
            <PendingPage>{children}</PendingPage>
          </main>
          {/* The reels feeds only: Trending now (owner 2026-10-16: the grid, like YouTube, has no right column). */}
          <HomeOnly reelsOnly>
            <RightRail />
          </HomeOnly>
        </div>
      </div>
      <BackToTop />
      <BottomTabBar />
      {/* Readers: "Want to publish a story?" once a minute (owner 2026-10-08). */}
      <PressPassNudge />
      {/* Readers, right after signing in: "Want to publish your first article?" (owner 2026-10-08). */}
      <PressPassWelcome />
      {/* Visitors past their free stories: the Instagram-style sign-up wall (owner 2026-10-08). */}
      <ReadWallHost />
      {/* Phone browsers: "Get the WebNEWS app" (owner 2026-10-16) — never in the app, gone for good once downloaded. */}
      <GetAppBanner />
    </>
  );
  // Grid or reels for Home and the categories (the switch beside Home, owner 2026-10-05).
  return <FeedLayoutProvider initial={layout}>{adminVisit ? <AdminVisit>{shell}</AdminVisit> : shell}</FeedLayoutProvider>;
}
