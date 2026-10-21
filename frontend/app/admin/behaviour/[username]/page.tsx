import type { Metadata } from "next";
import { PersonBehaviourView } from "@/components/admin/behaviour-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Behaviour" };

/** Desk → Behaviour → one person: everything they did while signed in (owner 2026-10-16). */
export default async function AdminPersonBehaviourPage({ params }: { params: Promise<{ username: string }> }) {
  await requireAdmin();
  const { username } = await params;
  return <PersonBehaviourView username={decodeURIComponent(username)} />;
}
