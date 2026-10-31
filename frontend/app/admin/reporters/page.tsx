import type { Metadata } from "next";
import { ReportersView, type ReporterFilters } from "@/components/admin/reporters-view";
import { param, pick } from "@/components/admin/server-loaders";
import { getAdminReporters } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Reporters" };

const LEVELS = ["all", "trainee", "verified", "revoked", "added"] as const;

export default async function AdminReportersPage({ searchParams }: PageProps<"/admin/reporters">) {
  await requireAdmin();
  const sp = await searchParams;
  const level = pick(param(sp.level), LEVELS, "all");
  const filters: ReporterFilters = { level: level === "all" ? undefined : level, q: param(sp.q)?.slice(0, 100) };
  return <ReportersView initialFilters={filters} initial={await getAdminReporters(filters)} />;
}
