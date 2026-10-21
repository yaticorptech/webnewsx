import Link from "next/link";
import { UserHandle } from "@/components/brand/user-handle";
import { ReporterMark } from "@/components/feed/story-badges";
import { FollowButton } from "@/components/follow/follow-button";
import { Avatar } from "@/components/ui/avatar";
import type { ArticleDetail, ReporterLevel } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type AuthorCardProps = {
  author: ArticleDetail["author"];
  /** Press mark next to the name (Verified badge / Trainee chip). */
  reporterLevel?: ReporterLevel | null;
  following: boolean;
  isOwn: boolean;
  preview?: boolean;
  className?: string;
};

/**
 * The publisher under the headline (redesign 2026-10-07, like Facebook / YouTube; before: one line under the story,
 * owner 2026-09-26): their photo, then name + press mark over the @handle — all linking to the profile — and Follow.
 */
export function AuthorCard({ author, reporterLevel = null, following, isOwn, preview = false, className }: AuthorCardProps) {
  const who = (
    <>
      <Avatar src={author.image} name={author.name} size={44} decorative />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[0.9375rem] font-extrabold text-ink transition-colors group-hover/author:text-brand">{author.name}</span>
          <ReporterMark level={reporterLevel} size={16} />
        </span>
        <UserHandle username={author.username} truncate className="flex min-w-0 text-[0.8125rem] text-muted" />
      </span>
    </>
  );
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)} inert={preview || undefined}>
      {preview ? (
        <span className="flex min-w-0 items-center gap-3">{who}</span>
      ) : (
        <Link
          href={`/${author.username}`}
          aria-label={`${author.name}, publisher — view profile`}
          className="group/author flex min-w-0 items-center gap-3 rounded-full outline-offset-2"
        >
          {who}
        </Link>
      )}
      {!isOwn && <FollowButton username={author.username} initialFollowing={following} size="sm" className="ml-1 shrink-0" />}
    </div>
  );
}
