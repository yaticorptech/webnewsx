"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bookmark,
  Compass,
  House,
  Mic,
  Newspaper,
  TrendingUp,
  UsersRound,
  UserRoundCheck,
  type LucideIcon,
  ShieldCheck,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { isFeedPath } from "@/components/feed/feed-views";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { qk } from "@/lib/query-keys";
import { canPublish } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { useAdminVisit } from "./admin-visit";

/*
 * Owner 2026-10-15: on desktop a slim rail of icons (each opens its page); the control at its foot expands it into the
 * full menu with labels, beside the page (the page moves over, nothing is covered); the one at the menu's foot collapses it.
 */
const MENU_KEY = "webnews-side-menu";
/** Remembered on this device: the menu stays expanded or collapsed across pages and visits. */
let menuOpen = (() => {
  try {
    return typeof window !== "undefined" && localStorage.getItem(MENU_KEY) === "open";
  } catch {
    return false;
  }
})();
const menuListeners = new Set<() => void>();
function setMenuOpen(open: boolean) {
  if (menuOpen === open) return;
  menuOpen = open;
  try {
    localStorage.setItem(MENU_KEY, open ? "open" : "closed");
  } catch {
    // Not remembered; fine.
  }
  menuListeners.forEach((listener) => listener());
}
const subscribeMenu = (listener: () => void) => {
  menuListeners.add(listener);
  return () => menuListeners.delete(listener);
};
const useMenuOpen = () => useSyncExternalStore(subscribeMenu, () => menuOpen, () => false);

/** Reporters you follow listed under the menu. */
const FOLLOWING_SHOWN = 8;

type Item = { href: string; label: string; icon: LucideIcon; active: boolean };

/**
 * The side menu (redesign 2026-10-07, Instagram / YouTube): ≥1024px only — phones and tablets have the bottom bar.
 * A slim icon rail (icon over a small label); from 1280px a full menu with labels, the reporters you follow and the
 * footer links — except on pages that need the width (a story with its comments, Messages, a press meet), which keep
 * the rail. `data-side-nav` tells the CSS how wide it is (--side-w: the chip row lines up with the
 * page column after it). Sticky under the top bar; scrolls on its own when taller than the screen.
 */
export function SideNav() {
  return (
    <Suspense fallback={<SideNavView tab={null} />}>
      <SideNavLive />
    </Suspense>
  );
}

function SideNavLive() {
  return <SideNavView tab={useSearchParams().get("tab")} />;
}

function SideNavView({ tab }: { tab: string | null }) {
  const viewer = useViewer();
  const adminVisit = useAdminVisit();
  const pathname = usePathname();
  const full = true;
  const open = useMenuOpen();
  const username = !adminVisit && viewer?.onboarded ? viewer.username : null;
  const writer = viewer !== null && canPublish(viewer);

  const onFollowing = pathname === "/" && tab === "following";
  const main: Item[] = [
    { href: "/", label: "Home", icon: House, active: isFeedPath(pathname) && !onFollowing },
    { href: "/?tab=following", label: "Following", icon: UserRoundCheck, active: onFollowing },
    { href: "/explore", label: "Explore", icon: Compass, active: pathname === "/explore" },
    { href: "/trending", label: "Trending", icon: TrendingUp, active: pathname === "/trending" },
  ];
  const yours: Item[] = username
    ? [
        writer
          ? { href: "/newsroom", label: "Newsroom", icon: Newspaper, active: pathname.startsWith("/newsroom") }
          : { href: "/press-pass", label: "Press Pass", icon: BadgeCheck, active: pathname === "/press-pass" },
        { href: "/press-meet", label: "Press meets", icon: Mic, active: pathname.startsWith("/press-meet") },
        { href: "/communities", label: "Communities", icon: UsersRound, active: pathname.startsWith("/communities") },
        { href: `/${username}?tab=saved`, label: "Saved", icon: Bookmark, active: pathname === `/${username}` && tab === "saved" },
      ]
    : [{ href: "/communities", label: "Communities", icon: UsersRound, active: pathname.startsWith("/communities") }];

  return (
    <>
    {/* The rail (owner 2026-10-15): icons only — each opens its page; the ☰ on top expands the menu. */}
    {!open && (
    <nav
      aria-label="Shortcuts"
      data-side-nav="rail"
      className="no-scrollbar sticky top-(--nav-h) hidden h-[calc(100dvh-var(--nav-h))] w-16 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border py-3 lg:flex"
    >
      {/* ☰ at the top, like YouTube (owner 2026-10-16): expands the menu. */}
      <MenuButton open={false} />
      {main.map((item) => (
        <RailLink key={item.href} item={item} />
      ))}
      <hr className="my-2 w-6 border-border" />
      {yours.map((item) => (
        <RailLink key={item.href} item={item} />
      ))}
    </nav>
    )}
    {open && (
    <aside
      id="side-menu"
      aria-label="Menu"
      data-side-nav="full"
      // Expanded (owner 2026-10-15): beside the page, pushing it over — never on top of it.
      className="no-scrollbar sticky top-(--nav-h) hidden h-[calc(100dvh-var(--nav-h))] w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface px-3 pb-4 pt-3 lg:flex"
    >
      {/* ☰ in the same spot collapses it again. */}
      <MenuButton open className="ml-1.5" />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {main.map((item) => (
          <MenuLink key={item.href} item={item} full={full} />
        ))}
      </nav>
      <hr className="mx-3 my-2.5 border-border" />
      <nav aria-label="Yours" className="flex flex-col gap-0.5">
        {yours.map((item) => (
          <MenuLink key={item.href} item={item} full={full} />
        ))}
      </nav>
      {full && username && <FollowingList username={username} />}
      {/* New readers (no Press Pass yet; owner 2026-10-10): an invitation to become a reporter, above the footer. */}
      {full && !writer && !adminVisit && (
        <div className="mt-auto pt-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-tint p-4 text-center">
            <div className="flex items-center gap-3 text-left">
              <ShieldCheck aria-hidden className="size-9 shrink-0 fill-brand text-white" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-ink">Be a Verified Reporter</p>
                <p className="text-xs text-ink-2">Share stories. Make an impact.</p>
              </div>
            </div>
            <Link
              href={viewer ? "/press-pass" : "/login?next=%2Fpress-pass"}
              className="inline-flex h-9 items-center rounded-lg bg-brand px-5 text-[0.8125rem] font-bold text-brand-contrast shadow-sm transition-colors hover:bg-brand-hover"
            >
              Apply Now
            </Link>
          </div>
        </div>
      )}
      {full && (
        <p className={cn("px-3 text-xs leading-relaxed text-muted", !writer && !adminVisit ? "pt-4" : "mt-auto pt-6")}>
          <Link href="/about" className="hover:text-ink">About</Link> · <Link href="/contact" className="hover:text-ink">Contact</Link> ·{" "}
          <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
          <br />© {new Date().getFullYear()} {COMPANY.brand}
        </p>
      )}
    </aside>
    )}
    </>
  );
}

/** The ☰ (owner 2026-10-16, like YouTube's hamburger): on the rail it expands the menu, on the menu it collapses it. */
function MenuButton({ open, className }: { open: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => setMenuOpen(!open)}
      aria-expanded={open}
      aria-controls="side-menu"
      aria-label={open ? "Collapse the menu" : "Expand the menu"}
      title={open ? "Collapse menu" : "Expand menu"}
      className={cn(
        "mb-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2",
        className,
      )}
    >
      <Menu aria-hidden className="size-6" />
    </button>
  );
}

/** A rail icon: opens its page; the name shows on hover. */
function RailLink({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      aria-label={item.label}
      title={item.label}
      className={cn(
        // The page you're on: red icon on a faint tint with a slim red bar at the rail's edge.
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
        "before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-0.75 before:rounded-r-full before:content-['']",
        item.active ? "bg-tint text-brand before:bg-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={item.active ? 2.25 : 1.85} />
    </Link>
  );
}

function MenuLink({ item, full }: { item: Item; full: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      title={item.label}
      className={cn(
        full
          ? "flex h-11 items-center gap-4 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors"
          : "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[0.625rem] font-semibold transition-colors",
        item.active ? "bg-tint-3/70 font-extrabold text-brand" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-5.5 shrink-0" strokeWidth={item.active ? 2.5 : 2} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

/** ≥1280px: the reporters you follow, newest follows first (like YouTube's subscriptions). */
function FollowingList({ username }: { username: string }) {
  const { data } = useQuery({
    // Its own key: the profile's follow list modal keeps `qk.following` as an infinite query ({ pages }), and sharing
    // the key with this plain first page crashed the modal ("reading 'length'"). Still under `qk.following`, so
    // follow / unfollow invalidations refresh it too.
    queryKey: [...qk.following(username), "side"],
    queryFn: ({ signal }) => api.following(username, null, signal),
    staleTime: 5 * 60_000,
  });
  const people = data?.items.slice(0, FOLLOWING_SHOWN) ?? [];
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="side-following">
      <hr className="mx-3 my-2.5 border-border" />
      <h2 id="side-following" className="kicker px-3 pb-1.5 pt-1 text-muted">
        Following
      </h2>
      <ul className="flex flex-col gap-0.5">
        {people.map((person) => (
          <li key={person.id}>
            <Link
              href={`/${person.username}`}
              className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <Avatar src={person.image} name={person.name} size={26} decorative />
              <span className="min-w-0 truncate">{person.name}</span>
              {person.reporterLevel === "verified" && <VerifiedBadge size={13} animate={false} tooltip={false} className="shrink-0" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
