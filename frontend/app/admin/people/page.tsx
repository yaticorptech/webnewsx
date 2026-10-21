import type { Metadata } from "next";
import { PeopleView, type PeopleFilters } from "@/components/admin/people-view";
import { param, pick } from "@/components/admin/server-loaders";
import { getAdminUsers } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "People" };

const ROLES = ["all", "reader", "reporter", "admin"] as const;
const STATUSES = ["any", "active", "suspended"] as const;

export default async function AdminPeoplePage({ searchParams }: PageProps<"/admin/people">) {
  await requireAdmin();
  const sp = await searchParams;
  const role = pick(param(sp.role), ROLES, "all");
  const status = pick(param(sp.status), STATUSES, "any");
  const filters: PeopleFilters = {
    q: param(sp.q)?.slice(0, 100),
    role: role === "all" ? undefined : role,
    status: status === "any" ? undefined : status,
  };
  return <PeopleView initialFilters={filters} initial={await getAdminUsers(filters)} />;
}
