import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MoreFromAuthorHeadingProps = {
  username: string;
  /** The heading's id (the section is labelled by it). */
  id: string;
  className?: string;
};

/** Id for the "More from" heading of `username` (handles may contain dots). */
export const moreFromHeadingId = (username: string) => `more-from-${username.replace(/\./g, "-")}`;

/**
 * "More from <handle>" + a link to the profile: the heading row of the publisher's other stories under a story. The
 * stories themselves are reels since 2026-09-26 (publisher-reel.tsx; this used to render 3 small tiles).
 */
export function MoreFromAuthorHeading({ username, id, className }: MoreFromAuthorHeadingProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4 border-b border-border pb-3", className)}>
      <h2 id={id} className="kicker flex min-w-0 items-baseline gap-2 text-ink">
        More from
        <UserHandle username={username} truncate className="text-[0.8125rem] normal-case tracking-normal text-brand" />
      </h2>
      <Link
        href={`/${username}`}
        className={cn(
          "group inline-flex items-center gap-1 rounded-sm text-[0.8125rem] font-bold text-brand",
          "transition-colors hover:text-brand-hover",
        )}
      >
        Profile
        <ArrowRight aria-hidden className="size-3.5 transition-transform duration-200 ease-snap group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export type MoreFromAuthorEndProps = {
  username: string;
  className?: string;
};

/**
 * The end of the publisher's reels under a story when they have more than the one page shown (publisher-reel.tsx): a
 * snap stop, like the feed's "You're all caught up", that sends the rest to the profile, so the site footer below stays
 * reachable instead of being pushed away by ever more reels.
 */
export function MoreFromAuthorEnd({ username, className }: MoreFromAuthorEndProps) {
  return (
    <div className={cn("panel-tint reel-snap flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center", className)}>
      <SpeedBarsSvg className="w-9 text-brand" />
      <p className="kicker text-ink">Those are the latest</p>
      <p className="max-w-xs text-sm text-muted">The rest of this publisher&apos;s stories are on their profile.</p>
      <Button href={`/${username}`} variant="secondary" size="sm" rightIcon={<ArrowRight aria-hidden />} className="mt-1 max-w-full">
        See all stories by <UserHandle username={username} truncate />
      </Button>
    </div>
  );
}
