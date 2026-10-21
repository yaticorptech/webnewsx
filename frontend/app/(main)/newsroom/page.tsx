import type { Metadata } from "next";
import { NewsroomDashboard } from "@/components/newsroom/newsroom-dashboard";
import {
  getNewsroomBestTimes,
  getNewsroomSeries,
  getNewsroomSpotlight,
  getNewsroomStories,
  getNewsroomSummary,
} from "@/lib/server-api";
import { requireReporter } from "@/lib/session";

export const metadata: Metadata = {
  title: "Newsroom",
  description: "Your reporting analytics: views, reads, likes, shares, followers, best time to publish and Spotlight.",
  robots: { index: false },
};

const INITIAL_RANGE = 7;

/**
 * /newsroom (SPEC §3.11) — Reporters and the Editor Desk only (`requireReporter`: logged out → /login,
 * not onboarded → /onboarding, Readers → /press-pass). Everything is server-rendered from the Newsroom
 * API (backend default time zone); the client then re-buckets days and hours in the reader's own zone.
 * Loader failures surface the (main) error boundary.
 */
export default async function NewsroomPage() {
  const viewer = await requireReporter("/newsroom");
  const [summary, series, stories, bestTimes, spotlight] = await Promise.all([
    getNewsroomSummary(INITIAL_RANGE),
    getNewsroomSeries(INITIAL_RANGE),
    getNewsroomStories(),
    getNewsroomBestTimes(),
    getNewsroomSpotlight(),
  ]);

  return (
    // data-grid-page: the Newsroom uses the full width of the screen (owner 2026-10-07: "make newsroom full screen").
    <section aria-label="Newsroom" data-grid-page="">
      <NewsroomDashboard
        viewer={{
          name: viewer.name,
          username: viewer.username,
          image: viewer.image,
          role: viewer.role,
          reporterLevel: viewer.reporterLevel,
          pressPass: viewer.pressPass,
        }}
        initial={{ summary, series, stories, bestTimes, spotlight }}
      />
    </section>
  );
}
