import Link from "next/link";
import type { ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Avatar } from "@/components/ui/avatar";
import type { ReporterLevel, Role } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { deskPersonHref } from "./nav";

export type PersonLike = {
  name: string;
  username: string | null;
  image?: string | null;
  role?: Role;
  reporterLevel?: ReporterLevel | null;
};

/** Verified reporters and the Editor Desk carry the animated badge next to their name (SPEC §3.11). */
export function showsBadge(person: Pick<PersonLike, "role" | "reporterLevel">): boolean {
  return person.reporterLevel === "verified" || person.role === "admin";
}

type PersonCellProps = {
  person: PersonLike;
  /** Extra line under the handle (email, pass number…). */
  detail?: ReactNode;
  size?: "sm" | "md";
  /** Link the name to the public profile (default true when the person has a username). */
  link?: boolean;
  className?: string;
};

/** Avatar + display name (+ Verified badge) + handle, used in every desk table. */
export function PersonCell({ person, detail, size = "md", link = true, className }: PersonCellProps) {
  const name = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-bold text-ink">{person.name || "Unnamed"}</span>
      {showsBadge(person) && <VerifiedBadge size={size === "sm" ? 14 : 16} />}
    </span>
  );
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar src={person.image ?? null} name={person.name || person.username || "?"} size={size === "sm" ? "sm" : "md"} decorative />
      <div className={cn("flex min-w-0 flex-col", size === "sm" ? "text-[0.8125rem]" : "text-sm")}>
        {link && person.username ? (
          <Link href={deskPersonHref(person.username)} className="min-w-0 rounded-sm hover:[&_span.truncate]:text-brand">
            {name}
          </Link>
        ) : (
          name
        )}
        {person.username ? (
          <UserHandle username={person.username} truncate className="text-xs text-muted" />
        ) : (
          <span className="truncate text-xs text-muted">No username yet</span>
        )}
        {detail && <span className="truncate text-xs text-muted">{detail}</span>}
      </div>
    </div>
  );
}
