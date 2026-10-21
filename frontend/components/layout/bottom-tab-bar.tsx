"use client";

import { House, LayoutDashboard, LogIn, Search, SquarePlay, SquarePlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";
import { PressPassGate } from "@/components/composer/press-pass-gate";
import { isFeedPath } from "@/components/feed/feed-views";
import { useFeedLayout } from "@/components/providers/feed-layout-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { ADMIN_HOME } from "@/lib/admin-home";
import { useSwipe } from "@/lib/hooks/use-swipe";
import type { FeedLayout } from "@/lib/feed-layout";
import { cn } from "@/lib/utils";
import { useAdminVisit } from "./admin-visit";
import { showPendingPage } from "./pending-page";
import { publishActionFor } from "./publish-action";

/**
 * Phone navigation (<768px; redesign 2026-10-07, like Instagram): a full-width bar on the screen's bottom edge —
 * Home · Reels · "+" · Explore · Profile (owner 2026-10-10: Messages went back to the top bar) (logged out: … · Log in). Icons only (named for screen readers), the "+" plain like
 * the rest (owner 2026-10-07); the current tab's icon is bolder with a small red dot under it. The "+" posts a new story — or leads to what's missing first:
 * Log in, Finish profile, Get your Press Pass (publish-action.ts). Explore opens /explore: a search field over a grid of
 * story posters. --tabbar-h (globals.css) is the bar's height (the safe area comes on top). An admin browsing as a
 * visitor ("Visit site") gets Home · Explore · Admin panel. Named "Primary": the composer hides it on phones by that
 * name while you write. A sideways swipe on a section's page moves to the next / previous section (useTabSwipe).
 */
export function BottomTabBar() {
  const viewer = useViewer();
  const adminVisit = useAdminVisit();
  const pathname = usePathname();
  const username = viewer?.onboarded ? viewer.username : null;

  const { layout, setLayout } = useFeedLayout();
  const onFeed = isFeedPath(pathname);
  // Home = the feed as a grid, Reels = the same feed as reels (the top bar's switch does the same).
  const homeActive = onFeed && layout === "grid";
  const reelsActive = onFeed && layout === "reel";
  const searchActive = pathname === "/explore";
  // The profile tab also covers the viewer's own settings and Press Pass pages.
  const profileActive =
    Boolean(username) && (pathname === `/${username}` || pathname.startsWith("/settings") || pathname === "/press-pass");

  // Swipe order: the bar's order (owner 2026-10-10) — Home · Reels · Explore · Profile (Post is an action, not a section;
  // no Log in / Admin panel page to swipe to).
  const profilePath = username && !adminVisit ? `/${username}` : null;
  const current = homeActive ? 0 : reelsActive ? 1 : searchActive ? 2 : pathname === profilePath ? 3 : -1;
  useTabSwipe(profilePath, current, setLayout);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {/* justify-around: each icon gets an equal share of the bar, so the end ones aren't pressed into its corners
          (owner 2026-10-01: the profile photo looked stuck in the right corner). */}
      <ul className="mx-auto flex h-13 max-w-md items-center justify-around px-2">
        <TabLink
          href="/"
          label="Home"
          active={homeActive}
          onClick={(event) => {
            if (layout !== "reel") return;
            event.preventDefault();
            setLayout("grid");
          }}
        >
          <House aria-hidden strokeWidth={homeActive ? 2.5 : 2} />
        </TabLink>

        <TabLink
          href="/"
          label="Reels"
          active={reelsActive}
          onClick={(event) => {
            event.preventDefault();
            if (!reelsActive) setLayout("reel");
          }}
        >
          <SquarePlay aria-hidden strokeWidth={reelsActive ? 2.5 : 2} />
        </TabLink>

        {!adminVisit && <NewPostTab />}

        <TabLink href="/explore" label="Explore" ariaLabel="Search and explore" active={searchActive}>
          <Search aria-hidden strokeWidth={searchActive ? 2.75 : 2} />
        </TabLink>


        {adminVisit ? (
          <TabLink href={ADMIN_HOME} label="Admin panel" active={false}>
            <LayoutDashboard aria-hidden />
          </TabLink>
        ) : username ? (
          <TabLink href={`/${username}`} label="Profile" active={profileActive}>
            <Avatar
              src={viewer?.image}
              name={viewer?.name ?? username}
              size={24}
              decorative
              className={profileActive ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : "ring-1 ring-border"}
            />
          </TabLink>
        ) : (
          <TabLink href="/login" label="Log in" active={pathname === "/login"}>
            <LogIn aria-hidden />
          </TabLink>
        )}
      </ul>
    </nav>
  );
}

function TabLink({
  href,
  label,
  ariaLabel,
  active,
  onClick,
  children,
}: {
  href: string;
  label: string;
  /** A fuller name for screen readers than the short visible label. */
  ariaLabel?: string;
  active: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  return (
    <li className="flex">
      <Link
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-12 w-14 flex-col items-center justify-center gap-1 rounded-2xl -outline-offset-2 transition-colors [&_svg]:size-6",
          active ? "text-ink" : "text-ink-2 hover:text-ink",
        )}
      >
        {children}
        <span aria-hidden className={cn("size-1.25 rounded-full", active ? "bg-brand" : "bg-transparent")} />
        <span className="sr-only">{label}</span>
      </Link>
    </li>
  );
}

const NEW_POST_CLASS =
  "relative flex h-12 w-14 flex-col items-center justify-center gap-1 rounded-2xl text-ink-2 -outline-offset-2 transition-colors hover:text-ink [&_svg]:size-6";

/**
 * The "+" in the bar: a plain icon like the others (owner 2026-10-07: not highlighted). New story for reporters; a
 * reader without a Press Pass gets "You don't have a Press Pass yet" there and then (owner 2026-10-08), with the way
 * to get one; otherwise the step that comes first (log in, profile).
 */
function NewPostTab() {
  const viewer = useViewer();
  const action = publishActionFor(viewer);
  const [gateOpen, setGateOpen] = useState(false);
  if (action.kind === "press-pass") {
    return (
      <li className="flex">
        <button type="button" aria-label="New story" title="Post" onClick={() => setGateOpen(true)} className={NEW_POST_CLASS}>
          <SquarePlus aria-hidden strokeWidth={2} />
          <span aria-hidden className="size-1.25" />
        </button>
        <PressPassGate
          open={gateOpen}
          onOpenChange={setGateOpen}
          title="You don't have a Press Pass yet"
          description="Get your Press Pass to publish stories on WebNEWS. It takes a minute — then continue with your story."
          cta="Get Press Pass"
        />
      </li>
    );
  }
  const href = action.kind === "login" ? "/login" : action.href;
  const label = action.kind === "publish" ? "New story" : action.kind === "login" ? "Log in to post a story" : action.label;
  return (
    <li className="flex">
      <Link
        href={href}
        aria-label={label}
        title="Post"
        className={NEW_POST_CLASS}
      >
        <SquarePlus aria-hidden strokeWidth={2} />
        <span aria-hidden className="size-1.25" />
      </Link>
    </li>
  );
}

/**
 * Phones (owner 2026-10-01): on a section's page (`current` ≥ 0), swiping right-to-left opens the next section of the bar
 * (Home → Reels → Explore → Profile), left-to-right the previous one — with the tapped-page skeleton, like a tab tap.
 * Not inside anything marked data-no-swipe (a profile swipes between its own tabs there, profile-view.tsx).
 */
function useTabSwipe(profilePath: string | null, current: number, setLayout: (layout: FeedLayout) => void) {
  const router = useRouter();
  // Home and Reels are the same feed in its two layouts: switching the layout opens it (feed-layout-provider.tsx).
  const sections: (FeedLayout | string)[] = ["grid", "reel", "/explore", ...(profilePath ? [profilePath] : [])];
  useSwipe(current >= 0, (direction) => {
    const next = sections[current + (direction === "left" ? 1 : -1)];
    if (!next) return;
    if (next === "grid" || next === "reel") {
      setLayout(next);
      return;
    }
    showPendingPage(next);
    router.push(next);
  });
}
