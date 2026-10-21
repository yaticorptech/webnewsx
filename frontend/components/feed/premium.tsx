import { Crown, Gem, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthorSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Premium (members-only) stories, owner 2026-10-14 ("like YouTube"): a gold "Premium" pill on the story, and — for a
 * reader who isn't a member — a "Buy premium" box in place of the story's text, which leads to the checkout page.
 */

export const membershipHref = (username: string, next?: string) =>
  `/membership/${encodeURIComponent(username)}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

/**
 * The premium mark on a story's photo (owner 2026-10-15): a red circle with a white diamond — on every members-only
 * story's card, nothing on the others.
 */
export function PremiumIcon({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span
      data-story-label="premium"
      title="Premium: for the reporter's members"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-md ring-2 ring-white/70", className)}
      style={{ width: size, height: size }}
    >
      <Gem aria-hidden strokeWidth={2.25} style={{ width: size * 0.5, height: size * 0.5 }} />
      <span className="sr-only">Premium</span>
    </span>
  );
}

/**
 * The premium mark flush in a photo's top-left corner (owner 2026-10-15: "left top corner, no gap"): a red tab with a
 * white diamond, square on the photo's edges (it follows the photo's rounded corner) and rounded on its inner corner.
 * Its parent must be `relative` (and clip with its own rounding).
 */
export function PremiumCorner({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span
      data-story-label="premium"
      title="Premium: for the reporter's members"
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-10 inline-flex items-center justify-center rounded-br-xl rounded-tl-[inherit] bg-brand text-white shadow-[2px_2px_8px_-2px_rgb(0_0_0/0.35)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Gem aria-hidden strokeWidth={2.25} style={{ width: size * 0.52, height: size * 0.52 }} />
      <span className="sr-only">Premium</span>
    </span>
  );
}

/** The "Premium" mark: on a photo (`onPhoto`, the cards) the red diamond icon; elsewhere (the story header) a gold pill. */
export function PremiumBadge({ className, onPhoto = false, locked = false }: { className?: string; onPhoto?: boolean; locked?: boolean }) {
  if (onPhoto) return <PremiumIcon />;
  return (
    <span
      data-story-label="premium"
      title="Premium: for the reporter's members"
      className={cn(
        "kicker inline-flex h-6 shrink-0 items-center gap-1 rounded-full pl-2 pr-2.5 leading-none normal-case tracking-normal [&_svg]:size-3.5",
        onPhoto ? "bg-amber-400 text-[#3b2600] shadow-md" : "bg-amber-100 text-amber-800 ring-1 ring-amber-300 ring-inset",
        className,
      )}
    >
      {locked ? <Lock aria-hidden strokeWidth={2.5} /> : <Crown aria-hidden strokeWidth={2.25} />}
      Premium
    </span>
  );
}

/** In place of a locked story's text (none of it is shown, owner 2026-10-14): what it is, the price, "Buy now". */
export function Paywall({
  author,
  priceInr,
  next,
  className,
}: {
  author: AuthorSummary;
  priceInr: number | null;
  next: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="rounded-2xl border border-amber-300 bg-gradient-to-b from-amber-50 to-surface px-5 py-6 text-center sm:px-8 sm:py-8">
        <span aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-400 text-[#3b2600] shadow-md">
          <Crown className="size-6" strokeWidth={2.25} />
        </span>
        <h2 className="mt-3 font-wide text-xl font-extrabold text-ink">Buy premium to read the full story</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          This story is only for <strong className="font-bold text-ink">{author.name}</strong>&rsquo;s premium members. A membership opens all of their
          members-only stories.
        </p>
        {priceInr !== null ? (
          <>
            <p className="mt-4 text-ink">
              <span className="font-wide text-2xl font-black">₹{priceInr.toLocaleString("en-IN")}</span>
              <span className="text-sm text-muted"> / month</span>
            </p>
            <Button href={membershipHref(author.username, next)} size="lg" className="mt-4 min-w-48" leftIcon={<Crown aria-hidden />}>
              Buy now
            </Button>
          </>
        ) : (
          <p className="mt-4 text-sm font-semibold text-ink-2">{author.name} isn&rsquo;t taking new members right now.</p>
        )}
      </div>
    </div>
  );
}
