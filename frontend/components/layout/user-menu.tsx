"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bookmark,
  Info,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserHandle, handleText } from "@/components/brand/user-handle";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { signOut } from "@/lib/auth-client";
import {
  canPublish,
  type ReporterLevel,
  type Role,
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
      {/* The menu (hamburger) only on your own profile, Settings and Press Pass pages (owner 2026-10-09, like
          Instagram); elsewhere the photo alone, which opens the profile. */}
      {onProfile && (
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
              {/* A hamburger (owner 2026-10-09; before: a chevron). */}
              <Menu aria-hidden className="size-5 max-sm:size-6" strokeWidth={2.25} />
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
                  {
                    ROLE_LINE[
                      role === "reporter" ? (reporterLevel ?? "trainee") : role
                    ]
                  }
                </p>
              </div>
            </div>
          }
          items={menuItems({
            username,
            role,
            reporterLevel,
            unreadNotices,
            logOut,
          })}
        />
      )}
    </div>
  );
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
