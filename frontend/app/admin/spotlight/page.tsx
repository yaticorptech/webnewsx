import type { Metadata } from "next";
import { SpotlightView } from "@/components/admin/spotlight-view";
import { getAdminSpotlightOrders, getAdminSpotlightPackages } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Spotlight" };

export default async function AdminSpotlightPage() {
  await requireAdmin();
  const [orders, packages] = await Promise.all([getAdminSpotlightOrders("pending"), getAdminSpotlightPackages()]);
  return <SpotlightView initialOrders={orders} initialPackages={packages} />;
}
