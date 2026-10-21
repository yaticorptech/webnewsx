import type { Metadata } from "next";
import { PressMeetsView } from "@/components/admin/press-meets-view";
import { getAdminPlatformFee, getAdminPressMeets } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Press meets" };

/** Desk → Press meets (owner 2026-10-05): the platform fee to book, and every press meet with its report. */
export default async function AdminPressMeetsPage() {
  await requireAdmin();
  const [fee, page] = await Promise.all([getAdminPlatformFee(), getAdminPressMeets()]);
  return <PressMeetsView initialFee={fee} initialPage={page} />;
}
