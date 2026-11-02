import type { Metadata } from "next";
import { DemoView } from "@/components/admin/demo-view";
import { getAdminDemo } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Demo engagement" };

export default async function AdminDemoPage() {
  await requireAdmin();
  return <DemoView initial={await getAdminDemo()} />;
}
