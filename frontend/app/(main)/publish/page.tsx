import type { Metadata } from "next";
import { ComposerRoot } from "@/components/composer/composer-root";
import { canPublish } from "@/lib/shared/contracts";
import { publishesToReview, requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Publish article",
  description: "Write and publish a news story on WebNEWS.",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Composer for a new story (SPEC §3.8, §3.11). Logged-out → /login, not onboarded → /onboarding. Readers see the page
 * too (owner 2026-10-08), but can't file from it: two seconds in, and on Save draft / Publish, it asks them to create a
 * Press Pass first (the API refuses their stories anyway). Trainees submit to the Review Desk.
 * `?pressMeet=<id>` (owner 2026-10-05: "Write your story" after a press meet): once published, the story is sent to
 * that press meet's organizer for verification.
 */
export default async function PublishPage({ searchParams }: PageProps<"/publish">) {
  const viewer = await requireOnboardedViewer("/publish");
  const needsPressPass = !canPublish(viewer);
  const raw = (await searchParams).pressMeet;
  const pressMeet = !needsPressPass && typeof raw === "string" && UUID.test(raw) ? raw : null;
  return (
    <ComposerRoot
      author={{ id: viewer.id, username: viewer.username, name: viewer.name, image: viewer.image, bio: viewer.bio }}
      draft={null}
      review={publishesToReview(viewer)}
      pressMeetId={pressMeet}
      needsPressPass={needsPressPass}
    />
  );
}
