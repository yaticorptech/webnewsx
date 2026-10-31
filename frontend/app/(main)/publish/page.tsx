import type { Metadata } from "next";
import Link from "next/link";
import { ComposerRoot } from "@/components/composer/composer-root";
import { PublishKind } from "@/components/wishes/publish-kind";
import { WishComposer } from "@/components/wishes/wish-composer";
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
  const params = await searchParams;
  const raw = params.pressMeet;
  const pressMeet = !needsPressPass && typeof raw === "string" && UUID.test(raw) ? raw : null;
  const author = { username: viewer.username, name: viewer.name, image: viewer.image };

  // Birthday wishes & invitations (owner 2026-10-31): without a Press Pass, + opens the birthday designs only; with one,
  // a choice at the top — Article or Birthday wish / invitation (every design).
  if (needsPressPass) {
    return (
      <>
        <WishComposer author={author} invitations={false} />
        <p className="mx-auto mt-8 w-full max-w-5xl text-sm text-muted">
          Want to publish news stories?{" "}
          <Link href="/press-pass" className="font-semibold text-brand hover:underline">
            Get your Press Pass
          </Link>
        </p>
      </>
    );
  }
  if (!pressMeet && params.type === "wish") {
    return (
      <WishComposer author={author} invitations kindSwitch={<PublishKind value="wish" />} />
    );
  }
  return (
    <ComposerRoot
      author={{ id: viewer.id, username: viewer.username, name: viewer.name, image: viewer.image, bio: viewer.bio }}
      draft={null}
      review={publishesToReview(viewer)}
      pressMeetId={pressMeet}
      needsPressPass={needsPressPass}
      kindSwitch={pressMeet ? null : <PublishKind value="article" />}
    />
  );
}
