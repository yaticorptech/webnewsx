import type { Metadata } from "next";
import { PressMeetReportViewer } from "@/components/press-meet/report-viewer";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Press meet report",
  robots: { index: false },
};

/** /press-meet/[id]/report (owner 2026-10-05): the press meet report, full screen and fitted to the phone's width. */
export default async function PressMeetReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOnboardedViewer(`/press-meet/${id}/report`);
  return <PressMeetReportViewer meetId={id} />;
}
