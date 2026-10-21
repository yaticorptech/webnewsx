"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import type { ProfileData } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type FollowListKind = "followers" | "following";

export type ProfileStatsProps = {
  counts: ProfileData["counts"];
  /** Opens the followers / following list. */
  onOpenList: (kind: FollowListKind) => void;
  /** Articles: shows the Published tab and scrolls to it (owner 2026-10-10). */
  onShowArticles?: () => void;
  className?: string;
};

/**
 * Articles · Followers · Following as plain numbers (owner 2026-10-08, like Instagram): on phones the three bold
 * counts spread beside the portrait with their labels under them (Instagram's app); from 640px one line beside the
 * name, "5 Articles · 3 Followers · 4 Following" (Instagram's web) — no icons, no card. Numbers roll when they change
 * (follows, realtime); Articles scrolls to the stories, Followers / Following open the list.
 */
export function ProfileStats({ counts, onOpenList, onShowArticles, className }: ProfileStatsProps) {
  return (
    <ul aria-label="Profile stats" className={cn("flex items-start justify-around gap-2 sm:justify-start sm:gap-8", className)}>
      {onShowArticles ? (
        <StatButton label="Articles" value={counts.articles} onClick={onShowArticles} testId="stat-articles" dialog={false} />
      ) : (
        <li className={CELL} data-testid="stat-articles">
          <Stat value={counts.articles} label="Articles" />
        </li>
      )}
      <StatButton label="Followers" value={counts.followers} onClick={() => onOpenList("followers")} testId="stat-followers" />
      <StatButton label="Following" value={counts.following} onClick={() => onOpenList("following")} testId="stat-following" />
    </ul>
  );
}

const CELL = "flex min-w-0 flex-col items-center sm:flex-row sm:items-baseline sm:gap-1.5";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <>
      <NumberTicker value={value} className="font-wide text-xl font-black leading-none tabular-nums text-ink sm:text-lg" />
      <span className="mt-1 text-[0.8125rem] font-medium text-muted transition-colors group-hover:text-brand sm:mt-0 sm:text-[0.9375rem] sm:text-ink-2">
        {label}
      </span>
    </>
  );
}

function StatButton({
  label,
  value,
  onClick,
  testId,
  dialog = true,
}: {
  label: string;
  value: number;
  onClick: () => void;
  testId: string;
  dialog?: boolean;
}) {
  return (
    <li className="flex min-w-0">
      <button
        type="button"
        onClick={onClick}
        aria-haspopup={dialog ? "dialog" : undefined}
        data-testid={testId}
        className={cn("group rounded-lg px-1 -outline-offset-2 transition-colors hover:text-brand", CELL)}
      >
        <Stat value={value} label={label} />
      </button>
    </li>
  );
}
