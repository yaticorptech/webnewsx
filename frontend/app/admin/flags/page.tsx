import type { Metadata } from "next";
import { FlagsView } from "@/components/admin/flags-view";
import { getAdminFlags } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Flags" };

export default async function AdminFlagsPage() {
  await requireAdmin();
  return <FlagsView initial={await getAdminFlags("open")} />;
}
