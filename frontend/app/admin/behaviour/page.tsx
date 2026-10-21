import type { Metadata } from "next";
import { BehaviourView } from "@/components/admin/behaviour-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Behaviour" };

/** Desk → Behaviour (owner 2026-10-16): every tap on the site, feature usage, the most active people. */
export default async function AdminBehaviourPage() {
  await requireAdmin();
  return <BehaviourView />;
}
