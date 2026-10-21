import type { Metadata } from "next";
import { BookingWizard } from "@/components/press-meet/new/booking-wizard";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Schedule a press meet",
  description: "Book a press meet: pick the time, invite reporters and pay the platform fee.",
  robots: { index: false },
};

/** /press-meet/new (owner 2026-10-01): date & time → reporters → details. Any member can organize one. */
export default async function NewPressMeetPage() {
  await requireOnboardedViewer("/press-meet/new");
  return <BookingWizard />;
}
