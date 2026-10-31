import type { Metadata } from "next";
import { ActivityView } from "@/components/admin/activity-view";
import { param } from "@/components/admin/server-loaders";
import { getAdminActivity } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Reporter activity" };

export default async function AdminActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdmin();
  const q = param((await searchParams).q)?.slice(0, 80) ?? "";
  return <ActivityView initialQuery={q} initial={await getAdminActivity(q)} />;
}
