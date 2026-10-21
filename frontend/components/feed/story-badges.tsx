import { EyeOff, Sparkles, Star } from "lucide-react";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import type { ArticleBadges, ReporterLevel } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Transparency labels and press marks for stories (SPEC §3.11):
 *  - "Editor's Pick" — pinned by the Editor Desk (crimson pill, white star);
 *  - "Spotlight"     — a paid boost is running (white pill, red sparkles) — always labelled;
 *  - the byline mark — the animated Verified badge for Verified reporters, a grey "Trainee" chip otherwise.
 */

const PILL = "kicker inline-flex h-6 shrink-0 items-center gap-1 rounded-full pl-2 pr-2.5 leading-none [&_svg]:size-3.5";

export const SPOTLIGHT_EXPLAINER = "Spotlight: the reporter paid to boost this story. It ranks higher in For You while the boost runs.";
export const EDITORS_PICK_EXPLAINER = "Editor's Pick: chosen by the WebNEWS Editor Desk.";

export function EditorsPickLabel({ className }: { className?: string }) {
  return (
    <span data-story-label="editors-pick" title={EDITORS_PICK_EXPLAINER} className={cn(PILL, "bg-brand text-brand-contrast", className)}>
      <Star aria-hidden className="fill-current" strokeWidth={2} />
      Editor&apos;s Pick
    </span>
  );
}

export function SpotlightLabel({ className }: { className?: string }) {
  return (
    <span
      data-story-label="spotlight"
      title={SPOTLIGHT_EXPLAINER}
      className={cn(PILL, "bg-surface text-brand ring-1 ring-tint-border ring-inset", className)}
    >
      <Sparkles aria-hidden strokeWidth={2.25} />
      Spotlight
      <span className="sr-only"> (paid boost)</span>
    </span>
  );
}

/** The small "Spotlighted" tag in a card's info line, in place of its date while the boost runs (owner 2026-10-16). */
export function SpotlightedTag({ className }: { className?: string }) {
  return (
    <span title={SPOTLIGHT_EXPLAINER} className={cn("inline-flex shrink-0 items-center gap-0.5 font-semibold text-brand", className)}>
      <Sparkles aria-hidden className="size-3" strokeWidth={2.5} />
      Spotlighted
    </span>
  );
}

/** Only on the author's / an admin's own view of a story the Editor Desk hid. */
export function HiddenLabel({ className }: { className?: string }) {
  return (
    <span
      data-story-label="hidden"
      title="Hidden by the Editor Desk — only you (and the desk) can see it"
      className={cn(PILL, "bg-surface text-ink ring-1 ring-border-strong ring-inset", className)}
    >
      <EyeOff aria-hidden strokeWidth={2.25} />
      Hidden
    </span>
  );
}

export function hasStoryLabels(badges: ArticleBadges | undefined, hidden?: boolean): boolean {
  // No "Spotlight" pill on stories (owner 2026-10-08): a spotlighted story just leads the feed.
  return Boolean(hidden || badges?.editorsPick);
}

/** The labels a story carries, in reading order (Hidden · Editor's Pick · Spotlight). Renders nothing without any. */
export function StoryLabels({
  badges,
  hidden,
  className,
  pillClassName,
}: {
  badges: ArticleBadges | undefined;
  hidden?: boolean;
  className?: string;
  /** Extra classes per pill (e.g. a shadow when they sit on a photo). */
  pillClassName?: string;
}) {
  if (!hasStoryLabels(badges, hidden)) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {hidden && <HiddenLabel className={pillClassName} />}
      {badges?.editorsPick && <EditorsPickLabel className={pillClassName} />}
    </span>
  );
}

/** Grey chip for Trainee reporters (their stories pass the Review Desk). */
export function TraineeChip({ className }: { className?: string }) {
  return (
    <span
      title="Trainee reporter — the Review Desk checks their stories before they go live"
      className={cn(
        "inline-flex h-4.5 shrink-0 items-center rounded-full bg-surface-2 px-1.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.08em] text-muted ring-1 ring-border ring-inset",
        className,
      )}
    >
      Trainee
    </span>
  );
}

/** Press mark next to a byline: Verified badge (animated) · Trainee chip · nothing for readers. */
export function ReporterMark({
  level,
  size = 16,
  focusable = true,
  className,
}: {
  level: ReporterLevel | null | undefined;
  size?: number;
  /** false inside links/buttons (the control's own name already says "verified reporter"; the tooltip still shows on hover). */
  focusable?: boolean;
  className?: string;
}) {
  if (level === "verified") return <VerifiedBadge size={size} focusable={focusable} className={className} />;
  if (level === "trainee") return <TraineeChip className={className} />;
  return null;
}

/** Suffix for accessible names that override the visible byline (e.g. a link's aria-label). */
export function reporterMarkText(level: ReporterLevel | null | undefined): string {
  if (level === "verified") return ", verified reporter";
  if (level === "trainee") return ", trainee reporter";
  return "";
}
