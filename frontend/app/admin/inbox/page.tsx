import type { Metadata } from "next";
import { InboxView } from "@/components/admin/inbox-view";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Inbox" };

export default async function AdminInboxPage() {
  await requireAdmin();
  return <InboxView />;
}
