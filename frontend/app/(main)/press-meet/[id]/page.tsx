import type { Metadata } from "next";
import { PressMeetDetailView } from "@/components/press-meet/detail/press-meet-detail";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Press meet",
  robots: { index: false },
};

/** /press-meet/[id] (owner 2026-10-01): one press meet, for its organizer and the reporters it invited. */
export default async function PressMeetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOnboardedViewer(`/press-meet/${id}`);
  return <PressMeetDetailView id={id} />;
}
