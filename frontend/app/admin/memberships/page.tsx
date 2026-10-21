import type { Metadata } from "next";
import { MembershipsView } from "@/components/admin/memberships-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Memberships" };

/** Desk → Memberships (owner 2026-10-15): membership money, WebNEWS's fee, what each reporter is owed, payouts. */
export default async function AdminMembershipsPage() {
  await requireAdmin();
  return <MembershipsView />;
}
