import type { Metadata } from "next";
import { OverviewView } from "@/components/admin/overview-view";
import { loadOverview } from "@/components/admin/server-loaders";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  return <OverviewView initial={await loadOverview()} />;
}
