import type { Metadata } from "next";
import { GroupApplicationsView } from "@/components/admin/group-applications-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Group accounts" };

/** Desk → Group accounts (owner 2026-10-23): Press Pass holders apply for an outlet account; the Desk approves. */
export default async function AdminGroupsPage() {
  await requireAdmin();
  return <GroupApplicationsView />;
}
