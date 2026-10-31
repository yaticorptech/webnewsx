import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ComposerRoot } from "@/components/composer/composer-root";
import { Button } from "@/components/ui/button";
import { getOwnedArticle } from "@/lib/server-api";
import { canPublish, getViewer, publishesToReview, requireOnboardedViewer, type OnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Edit draft",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Composer for one of the viewer's drafts — including stories waiting at the Review Desk or returned
 * with a note — or a published story to edit in place (owner 2026-10-02). Someone else's (or a missing)
 * story is a 404. Readers → /press-pass. A press meet story its organizer verified is locked (owner 2026-10-07): a note
 * instead of the composer.
 */
export default async function EditDraftPage({ params }: PageProps<"/publish/[id]">) {
  const { id } = await params;
  // The Editor Desk edits anyone's story here (owner 2026-10-31) — on the rest of the site an admin counts as a visitor.
  const signedIn = await getViewer();
  const desk = signedIn?.role === "admin" && signedIn.onboarded && signedIn.username ? (signedIn as OnboardedViewer) : null;
  const viewer = desk ?? (await requireOnboardedViewer(`/publish/${id}`));
  if (!UUID.test(id)) notFound();

  // Ownership first (someone else's draft is a 404 for everyone), then the role: a Reader — e.g. a
  // reporter whose pass was revoked — is sent to the Press Pass instead of the composer.
  const article = await getOwnedArticle(id);
  if (!article) notFound();
  if (!canPublish(viewer)) redirect("/press-pass");

  if (article.pressMeet && article.status === "published") {
    return (
      <section className="card mx-auto flex max-w-xl flex-col items-start gap-4 px-5 py-6 sm:px-7">
        <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success-strong">
          <BadgeCheck aria-hidden className="size-6" />
        </span>
        <div>
          <h1 className="font-wide text-xl font-extrabold text-ink">This story can&rsquo;t be edited</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
            {article.pressMeet.organizer.name} verified it for the press meet &ldquo;{article.pressMeet.title}&rdquo;, so it stays as they
            verified it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {article.slug && <Button href={`/a/${article.slug}`}>View story</Button>}
          <Button href={`/press-meet/${article.pressMeet.id}`} variant="outline">
            Press meet
          </Button>
        </div>
      </section>
    );
  }

  return (
    <ComposerRoot
      author={{ id: viewer.id, username: viewer.username, name: viewer.name, image: viewer.image, bio: viewer.bio }}
      draft={article}
      review={publishesToReview(viewer)}
    />
  );
}
