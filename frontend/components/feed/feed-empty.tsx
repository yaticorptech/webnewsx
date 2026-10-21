"use client";

import { Languages, PenLine, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { SpeedLines } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { FollowButton } from "@/components/follow/follow-button";
import { publishActionFor } from "@/components/layout/publish-action";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CATEGORY_ICONS } from "@/lib/categories";
import { CATEGORY_LABELS, PRESS_LANGUAGE_LABELS, type Category, type PressLanguage, type UserRow } from "@/lib/shared/contracts";

/**
 * Home / Latest is empty: nobody has published yet (a failed load never gets here — it shows the error
 * boundary). The call to action follows the role rules: only Reporters and the Editor Desk are offered the
 * composer; Readers get their Press Pass, visitors an account.
 */
export function LatestEmpty({ kicker = "Home" }: { kicker?: string }) {
  const publish = publishActionFor(useViewer());
  if (publish.kind === "login") {
    return (
      <EmptyState
        className="mt-6"
        kicker={kicker}
        title="The wire is quiet — for now"
        description="Stories land here the second they're published. Join to follow publishers — and get your Press Pass to report."
        action={
          <>
            <Button href="/signup">Create an account</Button>
            <Button href="/login" variant="outline">
              Log in
            </Button>
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      className="mt-6"
      kicker={kicker}
      title="The wire is quiet — for now"
      description={
        publish.kind === "publish"
          ? "Stories land here the second they're published. Be the one who breaks the news."
          : "Stories land here the second they're published."
      }
      action={
        <Button href={publish.href} leftIcon={publish.kind === "publish" ? <PenLine aria-hidden /> : undefined}>
          {publish.kind === "publish" ? "Publish the first story" : publish.label}
        </Button>
      }
    />
  );
}

/** Following is empty: suggest publishers (following one refetches the tab automatically). */
export function FollowingEmpty({ suggestions }: { suggestions: UserRow[] }) {
  const rows = suggestions.filter((user) => !user.isViewer);
  return (
    <div className="mt-6 flex flex-col gap-5">
      <EmptyState
        icon={<Users aria-hidden />}
        kicker="Following"
        title="Your Following feed is empty"
        description="Follow publishers and their new stories will show up here first."
        action={
          <Button href="/" variant="outline">
            Browse the top stories
          </Button>
        }
      />
      {rows.length > 0 && (
        <section aria-labelledby="suggested-publishers" className="card overflow-hidden">
          <h2 id="suggested-publishers" className="kicker flex items-center gap-2 px-5 pb-3 pt-4 text-ink">
            <SpeedLines className="text-[0.8rem]" />
            Publishers to follow
          </h2>
          <ul>
            {rows.map((user) => (
              <li key={user.id} className="flex items-center gap-3 border-t border-border px-5 py-3.5">
                <Link href={`/${user.username}`} className="group flex min-w-0 flex-1 items-center gap-3 rounded-md outline-offset-2">
                  <Avatar src={user.image} name={user.name} size="md" decorative />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink transition-colors group-hover:text-brand">{user.name}</span>
                      {user.reporterLevel === "verified" && <VerifiedBadge size={15} focusable={false} />}
                    </span>
                    <UserHandle username={user.username} truncate className="flex text-xs text-muted" />
                    {user.bio && <span className="mt-0.5 hidden truncate text-xs text-faint sm:block">{user.bio}</span>}
                  </span>
                </Link>
                <FollowButton username={user.username} initialFollowing={user.viewerFollows} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A category (or Karnataka district) page without stories yet. */
export function CategoryEmpty({ category, district }: { category: Category; district: string | null }) {
  const publish = publishActionFor(useViewer());
  const Icon = CATEGORY_ICONS[category];
  const name = district ?? CATEGORY_LABELS[category];
  return (
    <EmptyState
      className="mt-6"
      icon={<Icon aria-hidden />}
      kicker={name}
      title={district ? `Nothing from ${district} yet` : `Nothing in ${name} yet`}
      description={
        publish.kind === "publish"
          ? "Stories land here the second they're published in this section. Be the one who breaks the news."
          : "Stories land here the second they're published in this section."
      }
      action={
        publish.kind === "publish" ? (
          <Button href={publish.href} leftIcon={<PenLine aria-hidden />}>
            Write the first one
          </Button>
        ) : (
          <Button href="/" variant="outline">
            Back to Home
          </Button>
        )
      }
    />
  );
}

/** Languages with no stories yet (the Languages menu). */
export function LanguageEmpty({ languages }: { languages: PressLanguage[] }) {
  const publish = publishActionFor(useViewer());
  const name = languages.map((code) => PRESS_LANGUAGE_LABELS[code]).join(", ");
  return (
    <EmptyState
      className="mt-6"
      icon={<Languages aria-hidden />}
      kicker={name}
      title={`No ${name} news yet`}
      description={
        publish.kind === "publish"
          ? `Stories in ${name} land here the second they're published. Be the one who breaks the news.`
          : `Stories in ${name} land here the second they're published.`
      }
      action={
        publish.kind === "publish" ? (
          <Button href={publish.href} leftIcon={<PenLine aria-hidden />}>
            Write the first one
          </Button>
        ) : (
          <Button href="/" variant="outline">
            Back to Home
          </Button>
        )
      }
    />
  );
}

/** Following while logged out. */
export function FollowingSignedOut() {
  const next = encodeURIComponent("/?tab=following");
  return (
    <EmptyState
      className="mt-6"
      icon={<UserPlus aria-hidden />}
      kicker="Following"
      title="Your own front page"
      description="Log in to follow publishers and get their stories in one feed — live, the moment they publish."
      action={
        <>
          <Button href={`/login?next=${next}`}>Log in</Button>
          <Button href={`/signup?next=${next}`} variant="outline">
            Create an account
          </Button>
        </>
      }
    />
  );
}
