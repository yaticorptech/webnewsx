import type { Metadata } from "next";
import { PressMeetRoom } from "@/components/press-meet/room/press-meet-room";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Press meet · Live",
  robots: { index: false },
};

/**
 * /press-meet/[id]/live (owner 2026-10-01): the WebNEWS Live room, full screen — outside the site's masthead and tab
 * bar (its own route group).
 */
export default async function PressMeetLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOnboardedViewer(`/press-meet/${id}/live`);
  return <PressMeetRoom meetId={id} />;
}
