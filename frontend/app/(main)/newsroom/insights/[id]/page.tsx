import type { Metadata } from "next";
import { StoryInsightsView } from "@/components/insights/story-insights";
import { requireReporter } from "@/lib/session";

export const metadata: Metadata = { title: "Story insights", robots: { index: false } };

/** /newsroom/insights/<story id> — one of your stories' insights, Meta Ads style (owner 2026-10-16). */
export default async function StoryInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireReporter(`/newsroom/insights/${id}`);
  return <StoryInsightsView id={id} />;
}
