import type { Metadata } from "next";
import { VisitorsView } from "@/components/admin/visitors-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Visitors" };

export default async function AdminVisitorsPage() {
  await requireAdmin();
  return <VisitorsView />;
}
