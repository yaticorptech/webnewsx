import type { Metadata } from "next";
import { ReviewView } from "@/components/admin/review-view";
import { getReviewQueue } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Review Desk" };

export default async function AdminReviewPage() {
  await requireAdmin();
  return <ReviewView initial={await getReviewQueue()} />;
}
