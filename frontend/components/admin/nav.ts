import {
  Activity,
  Eye,
  Building2,
  Crown,
  FileClock,
  FlaskConical,
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

/** Five plain areas (owner 2026-11-11: "make it more simple and easy understandable"). */
export type DeskGroup = "Today" | "Content" | "People" | "Visitors" | "Logs";
export const DESK_GROUPS: readonly DeskGroup[] = ["Today", "Content", "People", "Visitors", "Logs"];

/** Editor Desk sections (SPEC §3.11), in sidebar order. Hrefs are the source of truth for the console's routes. */
export const DESK_SECTIONS: readonly DeskSection[] = [
  /* Today: what happened and what's waiting. */
  { key: "overview", href: "/admin", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard, group: "Today" },
  // Contact us messages and the team's replies (owner 2026-10-10); the badge counts the ones not answered yet.
  { key: "inbox", href: "/admin/inbox", label: "Messages", short: "Messages", icon: Inbox, pending: (k) => k.newMessages, group: "Today" },
  /* Content: stories and everything shown in the feed. */
  { key: "review", href: "/admin/review", label: "Stories to approve", short: "Approve", icon: Stamp, pending: (k) => k.reviewQueue, group: "Content" },
  // The badge counts stories waiting for a decision (REPORT_RULES.reviewAt+ open reports, owner 2026-09-30).
  { key: "flags", href: "/admin/flags", label: "Reported stories", short: "Reported", icon: Flag, pending: (k) => k.needsDecision, group: "Content" },
  { key: "stories", href: "/admin/stories", label: "All stories", short: "Stories", icon: Newspaper, group: "Content" },
  { key: "spotlight", href: "/admin/spotlight", label: "Spotlight ads", short: "Spotlight", icon: Sparkles, pending: (k) => k.spotlightRequests, group: "Content" },
  // The press meet platform fee + every press meet with its report (owner 2026-10-05).
  { key: "press-meets", href: "/admin/press-meets", label: "Press meets", short: "Meets", icon: Presentation, group: "Content" },
  /* People: accounts and money. */
  { key: "reporters", href: "/admin/reporters", label: "Reporters", short: "Reporters", icon: IdCard, group: "People" },
  { key: "people", href: "/admin/people", label: "Readers", short: "Readers", icon: UsersRound, group: "People" },
  // Group account applications from Press Pass holders (owner 2026-10-23).
  { key: "groups", href: "/admin/groups", label: "Group accounts", short: "Groups", icon: Building2, group: "People" },
  // Membership money, WebNewsX's fee and payouts to reporters (owner 2026-10-15).
  { key: "memberships", href: "/admin/memberships", label: "Memberships & payouts", short: "Members", icon: Crown, group: "People" },
  /* Visitors: who comes, from where, and what they do (owner 2026-11-11). */
  { key: "visitors", href: "/admin/visitors", label: "Visitors & sign-ins", short: "Visitors", icon: Eye, group: "Visitors" },
  // Every tap on the site with who made it (owner 2026-10-16).
  { key: "behaviour", href: "/admin/behaviour", label: "What people tap", short: "Taps", icon: Activity, group: "Visitors" },
  /* Logs: records kept for legal requests and testing tools. */
  // Every story reporters publish / edit / delete, with IP and device (owner 2026-10-31: kept for legal requests).
  { key: "activity", href: "/admin/activity", label: "Reporter activity", short: "Activity", icon: FileClock, group: "Logs" },
  { key: "audit", href: "/admin/audit", label: "Desk actions", short: "Audit", icon: ScrollText, group: "Logs" },
  // Generated counts for testing the UI on local / staging (owner 2026-11-02); locked off on the public site.
  { key: "demo", href: "/admin/demo", label: "Demo engagement", short: "Demo", icon: FlaskConical, group: "Logs" },
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
