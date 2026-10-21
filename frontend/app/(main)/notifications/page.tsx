import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Likes, comments, follows, press meet invites and notices from the Editor Desk.",
  robots: { index: false, follow: false },
};

/** /notifications (owner 2026-10-08): the full Notifications page — phones and the app open it from the bell. */
export default async function NotificationsPage() {
  const viewer = await requireOnboardedViewer("/notifications");
  return <NotificationsView username={viewer.username} />;
}
