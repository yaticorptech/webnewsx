import type { Metadata } from "next";
import { PressMeetHub } from "@/components/press-meet/press-meet-hub";
import { canPublish, requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Press meet",
  description: "Schedule press meets, invite verified reporters and follow the coverage on WebNEWS.",
  robots: { index: false },
};

/** /press-meet (owner 2026-10-01): the press meets you organize, from your profile's "Press meet" button. */
export default async function PressMeetPage() {
  const viewer = await requireOnboardedViewer("/press-meet");
  return <PressMeetHub username={viewer.username} reporter={canPublish(viewer)} />;
}
