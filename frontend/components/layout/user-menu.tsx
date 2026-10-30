"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bookmark,
  Building2,
  ChevronDown,
  Info,
  LogOut,
  Settings,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserHandle, handleText } from "@/components/brand/user-handle";
import { useSwitchAccount } from "@/components/groups/use-switch-account";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { signOut } from "@/lib/auth-client";
import {
  GROUP_ROLE_LABELS,
  canPublish,
  type ReporterLevel,
  type Role,
  type ViewerUser,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type UserMenuProps = {
  username: string;
  name: string;
  image: string | null;
  /** Role-based links (SPEC §3.11). Defaults to a Reader. */
  role?: Role;
  reporterLevel?: ReporterLevel | null;
  /** Unread notices from the Editor Desk: a red dot on the menu and a "Notices" entry. */
  unreadNotices?: number;
  className?: string;
};

const ROLE_LINE: Record<string, string> = {
  reader: "Reader",
  trainee: "Trainee reporter",
  verified: "Verified reporter",
  admin: "Editor Desk",
};

/**
 * Masthead account control: the avatar (black ring — owner request) links straight to the profile; the chevron opens
 * the account menu — its header (avatar · name) opens the profile, then by role: Newsroom (reporters/admins) or
 * "Get your Press Pass" (Readers) · Saved — then Settings (owner 2026-10-01) · About · Log out. No Messages /
 * Communities / View profile / Desk / Edit profile entries (owner 2026-10-02): the nav, the header and the profile's
 * own tabs and buttons already cover them. Phones show only the chevron (owner rule 2026-09-25):
 * the bottom bar's Profile tab already carries the avatar — and only on your own profile, settings and Press Pass
 * pages (owner 2026-10-05: not on Home, the categories or anywhere else).
 */
export function UserMenu({
  username,
  name,
  image,
  role = "reader",
  reporterLevel = null,
  unreadNotices = 0,
  className,
}: UserMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const { switchTo } = useSwitchAccount();
  const onProfile =
    pathname === `/${username}` ||
    pathname.startsWith("/settings") ||
    pathname === "/press-pass";

  const logOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("Couldn't log out", {
        description: error.message || "Please try again.",
      });
      return;
    }
    queryClient.clear();
    router.push("/");
    router.refresh();
    toast.warning("You're logged out", { description: "See you on the wire." });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 md:gap-0.5",
        !onProfile && "max-md:hidden",
        className,
      )}
    >
      <Link
        href={`/${username}`}
        aria-label={`Your profile, ${handleText(username)}`}
        data-tour="profile"
        className="relative rounded-full p-1 outline-offset-0 transition-transform duration-150 ease-snap hover:scale-105 motion-reduce:hover:scale-100 max-md:hidden"
      >
        <Avatar
          src={image}
          name={name}
          size="sm"
          ring="ink"
          decorative
          priority
        />
      </Link>
      {/* The menu (dropdown) on every page on computers (owner 2026-10-28); phones show it only on your own
          profile, Settings and Press Pass pages (the wrapper above hides it elsewhere). */}
      <DropdownMenu
        label={
          unreadNotices > 0
            ? `Account menu, ${unreadNotices} unread notice${unreadNotices === 1 ? "" : "s"}`
            : "Account menu"
        }
        align="end"
        triggerClassName="group relative inline-flex size-8 items-center justify-center rounded-full text-muted max-sm:size-10 transition-colors hover:bg-tint-2 hover:text-brand aria-expanded:bg-tint-2 aria-expanded:text-brand max-md:after:absolute max-md:after:-inset-y-1.5 max-md:after:-left-0.5 max-md:after:-right-2.5 max-md:after:content-['']"
        trigger={
          <>
            {/* A dropdown chevron (owner 2026-10-29; before: a hamburger). */}
            <ChevronDown
              aria-hidden
              className="size-5 transition-transform duration-200 group-aria-expanded:rotate-180 max-sm:size-6 motion-reduce:transition-none"
              strokeWidth={2.25}
            />
            {unreadNotices > 0 && (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-surface"
              />
            )}
          </>
        }
        headerHref={`/${username}`}
        header={
          <div className="flex items-center gap-3">
            <Avatar src={image} name={name} size="md" decorative />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{name}</p>
              <UserHandle
                username={username}
                truncate
                className="flex text-xs text-muted"
              />
              <p className="mt-0.5 truncate text-xs font-semibold text-ink-2">
                {viewer?.actingAs
                  ? `Group · you're ${GROUP_ROLE_LABELS[viewer.actingAs.role].toLowerCase()}`
                  : ROLE_LINE[
                      role === "reporter" ? (reporterLevel ?? "trainee") : role
                    ]}
              </p>
            </div>
          </div>
        }
        items={[
          ...switchItems(viewer, switchTo),
          ...menuItems({
            username,
            role,
            reporterLevel,
            unreadNotices,
            logOut,
          }),
        ]}
      />
    </div>
  );
}

/**
 * "Switch account" (owner 2026-10-23, like Instagram): your own account and each group account you belong to, then the
 * Groups page (invitations, applying, members).
 */
function switchItems(
  viewer: ViewerUser | null,
  switchTo: (group: { id: string; name: string } | null) => void,
): DropdownItem[] {
  if (!viewer) return [];
  const items: DropdownItem[] = [{ type: "separator" }];
  const acting = viewer.actingAs;
  const others = (viewer.groups ?? []).filter((g) => g.id !== viewer.id);
  if (acting || others.length > 0) items.push({ type: "label", label: "Switch account" });
  if (acting) {
    items.push({
      label: <span className="truncate">{acting.member.name || "Your account"}</span>,
      icon: <Avatar src={acting.member.image} name={acting.member.name} size={20} decorative />,
      onSelect: () => switchTo(null),
    });
  }
  for (const group of others) {
    items.push({
      label: <span className="truncate">{group.name}</span>,
      icon: <Avatar src={group.image} name={group.name} size={20} decorative />,
      onSelect: () => switchTo(group),
    });
  }
  // One entry (owner 2026-10-23: both went to the same page): posting as a group, "Group settings" opens that group
  // on the Groups page (members, waiting stories, deactivate / delete); otherwise "Group accounts".
  items.push(
    acting
      ? { label: "Group settings", href: `/groups?manage=${encodeURIComponent(acting.groupId)}`, icon: <Building2 aria-hidden /> }
      : { label: "Group accounts", href: "/groups", icon: <Building2 aria-hidden /> },
  );
  return items;
}

function menuItems({
  username,
  role,
  reporterLevel,
  unreadNotices,
  logOut,
}: {
  username: string;
  role: Role;
  reporterLevel: ReporterLevel | null;
  unreadNotices: number;
  logOut: () => void;
}): DropdownItem[] {
  const holder = { role, reporterLevel };
  const writer = canPublish(holder);
  const items: DropdownItem[] = [{ type: "separator" }];
  // Newsroom is an option in Settings (owner 2026-10-09), not here.
  if (writer) {
    if (unreadNotices > 0) {
      items.push({
        label: (
          <span className="flex items-center gap-2 font-bold text-brand">
            Notices
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] text-brand-contrast">
              {unreadNotices}
            </span>
          </span>
        ),
        href: "/newsroom#notices",
        icon: <ShieldAlert aria-hidden />,
      });
    }
    // No link to the Editor Desk anywhere on the site: it opens only from the Log in page (lib/admin-home.ts).
  }
  items.push({
    label: "Saved",
    href: `/${username}?tab=saved`,
    icon: <Bookmark aria-hidden />,
  });
  // The Press Pass stays here (owner 2026-10-09: "press pass outside I need"); Newsroom is in Settings.
  items.push(
    writer
      ? {
          label: "Your Press Pass",
          href: "/press-pass",
          icon: <BadgeCheck aria-hidden />,
        }
      : {
          label: (
            <span className="font-bold text-brand">Get your Press Pass</span>
          ),
          href: "/press-pass",
          icon: <BadgeCheck aria-hidden />,
        },
  );
  items.push(
    { type: "separator" },
    { label: "Settings", href: "/settings", icon: <Settings aria-hidden /> },
    { label: "About WebNEWS", href: "/about", icon: <Info aria-hidden /> },
    { type: "separator" },
    {
      label: "Log out",
      onSelect: logOut,
      icon: <LogOut aria-hidden />,
      danger: true,
    },
  );
  return items;
}
