import type { Metadata } from "next";
import { AUDIT_GROUPS } from "@/components/admin/audit-groups";
import { AuditView, type AuditFilters } from "@/components/admin/audit-view";
import { param, pick } from "@/components/admin/server-loaders";
import { getAdminAudit } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const action = pick(param(sp.action), AUDIT_GROUPS.map((g) => g.value), "all");
  const filters: AuditFilters = { action: action === "all" ? undefined : action, target: param(sp.target)?.slice(0, 128) };
  return <AuditView initialFilters={filters} initial={await getAdminAudit(filters)} />;
}
