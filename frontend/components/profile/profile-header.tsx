"use client";

import { PenLine, Presentation } from "lucide-react";
import { motion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { FollowButton } from "@/components/follow/follow-button";
import { MessageButton } from "@/components/messages/message-button";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import type { ProfileData } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileCardMobile } from "./profile-card-mobile";
import { BackButton } from "@/components/layout/back-button";
import { ShareProfileButton } from "./share-profile-button";
import { ProfileStats, type FollowListKind } from "./stats-band";

export type ProfileHeaderProps = {
  user: ProfileData["user"];
  isSelf: boolean;
  /** Server-known follow state (FollowButton shares the live state through the query cache). */
  initialFollowing: boolean;
  /** Verified reporter / Editor Desk → the animated Verified badge beside the name. */
  verified?: boolean;
  /** Articles · Followers · Following beside the portrait. */
  counts: ProfileData["counts"];
  onOpenList: (kind: FollowListKind) => void;
  onShowArticles?: () => void;
  /** Region and languages for the phone card (owner 2026-10-31). */
  press?: ProfileData["press"];
};

/**
 * Profile header (SPEC §3.7), plain like Instagram's (owner 2026-10-08: no cover picture, no tint — a white card;
 * a black version was tried and put back, owner 2026-10-09). Wide screens, Instagram's web layout: the portrait on the left; beside it the name with the actions on the same
 * line, then the counts in a row ("5 Articles · 3 Followers · 4 Following"), the @handle and the bio. Phones,
 * Instagram's app layout: the portrait beside the three counts, then the name, @handle and bio, then the actions in
 * one full-width row. Own profile: Edit profile · Press meet · Share; someone else's: Follow · Message · Share.
 */
export function ProfileHeader({
  user,
  isSelf,
  initialFollowing,
  verified = false,
  counts,
  onOpenList,
  onShowArticles,
  press = null,
}: ProfileHeaderProps) {
  return (
    <>
      {/* Phones and the app (owner 2026-10-31): the designed profile card; tablets and computers: the white header below. */}
      <div className="md:hidden">
        <ProfileCardMobile
          user={user}
          isSelf={isSelf}
          initialFollowing={initialFollowing}
          verified={verified}
          counts={counts}
          press={press}
          onOpenList={onOpenList}
          onShowArticles={onShowArticles}
        />
      </div>
      <section aria-labelledby="profile-name" className="card hidden px-4 py-4 sm:px-8 sm:py-6 md:block">
        {/* The page's back arrow lives here on profiles (owner 2026-09-28; the shell's one is hidden, globals.css), in
          a line of its own above the portrait — a plain arrow, no circle (owner 2026-10-08). Not in the Android
          app (owner 2026-10-05): the phone's back button does it. */}
        <div data-own-back="" data-app-no-back="" className="mb-3 flex sm:mb-4">
          <BackButton fallback="/" plain />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3",
            "[grid-template-areas:'avatar_stats'_'name_name'_'handle_handle'_'bio_bio'_'actions_actions']",
            "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-8 sm:gap-y-3.5",
            "sm:[grid-template-areas:'avatar_name_actions'_'avatar_stats_stats'_'avatar_handle_handle'_'avatar_bio_bio']",
          )}
        >
          {/* No role badge on the portrait (owner 2026-10-08). */}
          <ProfileAvatar src={user.image} name={user.name} className="[grid-area:avatar]" />

          {/* The name and @username always show in full (owner 2026-09-28). */}
          <div className="flex min-w-0 items-center [grid-area:name]">
            <ProfileName name={user.name} verified={verified} />
          </div>

          <ProfileStats counts={counts} onOpenList={onOpenList} onShowArticles={onShowArticles} className="self-center [grid-area:stats]" />

          <p className="flex min-w-0 max-w-full items-center gap-2 text-[0.9375rem] font-bold text-brand [grid-area:handle]">
            <UserHandle username={user.username} truncate />
            {/* A group account (owner 2026-10-23): one outlet, several members — readers see only its name. */}
            {user.accountType === "group" && (
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-bold text-ink-2">News outlet</span>
            )}
          </p>

          {user.bio && (
            <p className="line-clamp-3 max-w-lg whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2 wrap-anywhere [grid-area:bio]">
              {user.bio}
            </p>
          )}

          {/* Phones: two equal buttons and the share icon in one row; wider screens: beside the name, with labels. */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2.5 [grid-area:actions] sm:flex sm:items-center sm:gap-2">
            {isSelf ? (
              <>
                <Button href="/settings/profile" leftIcon={<PenLine aria-hidden />} className={PHONE_FIT}>
                  <span className="truncate">Edit profile</span>
                </Button>
                <Button href="/press-meet" variant="outline" leftIcon={<Presentation aria-hidden />} className={cn(PHONE_FIT, RED_OUTLINE)}>
                  <span className="truncate">Press meet</span>
                </Button>
              </>
            ) : (
              <>
                <FollowButton username={user.username} initialFollowing={initialFollowing} className="max-sm:min-w-0" />
                {/* Like Instagram: Follow · Message · share (just its icon on phones, where the row is tight). */}
                <MessageButton username={user.username} className={cn("px-4 max-sm:min-w-0", RED_OUTLINE)} />
              </>
            )}
            <ShareProfileButton
              username={user.username}
              name={user.name}
              image={user.image}
              compact
              className="max-sm:size-10 max-sm:px-0 max-sm:[&>span]:sr-only"
            />
          </div>
        </motion.div>
      </section>
    </>
  );
}

/** A white button with a red edge and red text (the mockup's "Press meet"). */
const RED_OUTLINE = "border border-brand/45 bg-surface text-brand-strong ring-0 hover:border-brand hover:bg-tint";

/** Own-profile buttons on phones: no icon, slightly smaller text, shrink with an ellipsis rather than overflow. */
const PHONE_FIT = "max-sm:min-w-0 max-sm:gap-0 max-sm:px-2.5 max-sm:text-[0.8125rem] max-sm:[&>svg]:hidden";

/** The smallest the name shrinks to (px); only a name that is still too long then ends in "…" (full name on hover). */
const NAME_MIN_PX = 12;

/**
 * The display name on ONE line whatever its length (owner 2026-09-26: never "Aksh / u"), left-aligned beside the
 * portrait; a name too long for its column shrinks to fit — the Verified badge (sized in em) shrinks with it. Refits
 * when the card resizes and once the font has loaded.
 */
function ProfileName({ name, verified }: { name: string; verified: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    const text = textRef.current;
    if (!heading || !text) return;
    let width = -1;
    const fit = () => {
      heading.style.fontSize = "";
      const overflow = text.scrollWidth - text.clientWidth;
      if (overflow <= 0) return;
      // Badge and gap are in em, so the whole line scales together: shrink by room / (room + overflow).
      const room = heading.clientWidth;
      const size = (parseFloat(getComputedStyle(heading).fontSize) * room) / (room + overflow);
      heading.style.fontSize = `${Math.max(NAME_MIN_PX, Math.floor(size * 10) / 10)}px`;
    };
    fit();
    // Refit on width changes only (fitting changes the height).
    const observer = new ResizeObserver(() => {
      if (heading.clientWidth === width) return;
      width = heading.clientWidth;
      fit();
    });
    observer.observe(heading);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [name, verified]);

  return (
    <h1
      ref={headingRef}
      id="profile-name"
      className="flex w-full min-w-0 items-center gap-[0.3em] whitespace-nowrap font-wide text-[1.5rem] font-black leading-tight tracking-tight text-ink sm:text-[1.75rem]"
    >
      <span ref={textRef} title={name} className="min-w-0 truncate py-[0.1em]">
        {name}
      </span>
      {verified && <VerifiedBadge size={24} className="size-[0.85em]! shrink-0 [&>svg]:size-full" />}
    </h1>
  );
}
