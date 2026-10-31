import {
  Activity,
  Building2,
  Crown,
  FileClock,
  Flag,
  IdCard,
  Inbox,
  LayoutDashboard,
  Newspaper,
  Presentation,
  ScrollText,
  Sparkles,
  Stamp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { AdminOverview } from "@/lib/shared/contracts";

export type DeskKpis = AdminOverview["kpis"];

export type DeskSection = {
  key: string;
  href: string;
  label: string;
  /** Shorter label for the phone tab row. */
  short: string;
  icon: LucideIcon;
  /** Items waiting for the desk (red badge when > 0). */
  pending?: (kpis: DeskKpis) => number;
  /** The sidebar group it sits in (owner 2026-10-16: grouped like a newsroom CMS). */
  group: DeskGroup;
};

export type DeskGroup = "Overview" | "Newsroom" | "People" | "Revenue" | "System";
export const DESK_GROUPS: readonly DeskGroup[] = ["Overview", "Newsroom", "People", "Revenue", "System"];

/** Editor Desk sections (SPEC §3.11), in sidebar order. Hrefs are the source of truth for the console's routes. */
export const DESK_SECTIONS: readonly DeskSection[] = [
  { key: "overview", href: "/admin", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { key: "review", href: "/admin/review", label: "Review Desk", short: "Review", icon: Stamp, pending: (k) => k.reviewQueue, group: "Newsroom" },
  // The badge counts stories waiting for a decision (REPORT_RULES.reviewAt+ open reports, owner 2026-09-30).
  { key: "flags", href: "/admin/flags", label: "Flags", short: "Flags", icon: Flag, pending: (k) => k.needsDecision, group: "Newsroom" },
  // Contact us messages and the team's replies (owner 2026-10-10); the badge counts the ones not answered yet.
  { key: "inbox", href: "/admin/inbox", label: "Inbox", short: "Inbox", icon: Inbox, pending: (k) => k.newMessages, group: "Newsroom" },
  { key: "stories", href: "/admin/stories", label: "Stories", short: "Stories", icon: Newspaper, group: "Newsroom" },
  { key: "reporters", href: "/admin/reporters", label: "Reporters", short: "Reporters", icon: IdCard, group: "People" },
  { key: "people", href: "/admin/people", label: "Readers", short: "Readers", icon: UsersRound, group: "People" },
  // Group account applications from Press Pass holders (owner 2026-10-23).
  { key: "groups", href: "/admin/groups", label: "Group accounts", short: "Groups", icon: Building2, group: "People" },
  { key: "spotlight", href: "/admin/spotlight", label: "Spotlight", short: "Spotlight", icon: Sparkles, pending: (k) => k.spotlightRequests, group: "Revenue" },
  // The press meet platform fee + every press meet with its report (owner 2026-10-05).
  { key: "press-meets", href: "/admin/press-meets", label: "Press meets", short: "Meets", icon: Presentation, group: "Revenue" },
  // Membership money, WebNEWS's fee and payouts to reporters (owner 2026-10-15).
  { key: "memberships", href: "/admin/memberships", label: "Memberships", short: "Members", icon: Crown, group: "Revenue" },
  // Every tap on the site with who made it (owner 2026-10-16).
  { key: "behaviour", href: "/admin/behaviour", label: "Analytics", short: "Analytics", icon: Activity, group: "Overview" },
  // Every story reporters publish / edit / delete, with IP and device (owner 2026-10-31: kept for legal requests).
  { key: "activity", href: "/admin/activity", label: "Reporter activity", short: "Activity", icon: FileClock, group: "System" },
  { key: "audit", href: "/admin/audit", label: "Audit log", short: "Audit", icon: ScrollText, group: "System" },
];

/*
 * In-console destinations for people and stories: an admin sees only the Editor Desk, never the site (owner rule
 * 2026-09-25), so console links never point at profile or story pages.
 */
export const deskPersonHref = (username: string): string => `/admin/people?q=${encodeURIComponent(username)}`;
export const deskStoryHref = (title: string | null): string =>
  title ? `/admin/stories?q=${encodeURIComponent(title.slice(0, 100))}` : "/admin/stories";

/** The section a pathname belongs to (longest matching href wins; "/admin" only matches exactly). */
export function activeSection(pathname: string): DeskSection | undefined {
  return [...DESK_SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((section) => (section.href === "/admin" ? pathname === "/admin" : pathname === section.href || pathname.startsWith(`${section.href}/`)));
}
