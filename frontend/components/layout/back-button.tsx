"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { isFeedPath } from "@/components/feed/feed-views";
import { goBack } from "@/lib/nav-history";
import { cn } from "@/lib/utils";

export type BackButtonProps = {
  /** Where to go when there is no previous page on this site (opened from a link / typed in). */
  fallback: string;
  /** Just the arrow (no circle), for a heading line (the composer's "← NEWSROOM"). */
  plain?: boolean;
  className?: string;
};

/**
 * The label-less back arrow (owner rule 2026-09-25): the previous page on this site, else `fallback` — never out
 * of the site (lib/nav-history.ts). Screen readers hear "Go back"; the tooltip says "Back". `data-back-button` lets
 * the composer's unsaved-changes guard ask first, like it does for links.
 */
export function BackButton({ fallback, plain = false, className }: BackButtonProps) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Go back"
      title="Back"
      data-back-button=""
      data-back-fallback={fallback}
      onClick={() => goBack(router, fallback)}
      className={cn(
        plain
          ? // Plain arrow in a heading line; the invisible tap area still reaches 44px.
            "relative -ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink transition-colors hover:text-brand after:absolute after:-inset-2 after:content-[''] [&_svg]:size-5"
          : [
              // Small (owner 2026-09-28): 32px with a 16px arrow; the invisible tap area still reaches 44px.
              "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card",
              "transition-[color,border-color,transform] duration-150 ease-snap hover:border-brand hover:text-brand active:scale-95 motion-reduce:active:scale-100",
              "after:absolute after:-inset-1.5 after:content-[''] [&_svg]:size-4",
            ],
        className,
      )}
    >
      <ArrowLeft aria-hidden strokeWidth={2.25} />
    </button>
  );
}

/** Pages without the shell's back arrow in the Android app: articles and About (owner 2026-10-02). */
const APP_NO_BACK = (pathname: string) => pathname.startsWith("/a/") || pathname === "/about";

/** Site pages (app shell): the back arrow above the page content — every page except the home feed. */
export function PageBack() {
  const pathname = usePathname();
  // Feeds (Home and its category pages) navigate with the category nav instead; the inbox, a chat and Communities
  // carry the arrow in their own heading line, as does the Press Pass (owner 2026-10-07); Search is a tab of its own
  // (owner 2026-09-30).
  if (
    isFeedPath(pathname) ||
    /^\/messages(\/[^/]+)?$/.test(pathname) ||
    pathname === "/communities" ||
    pathname === "/press-pass" ||
    pathname === "/explore"
  ) {
    return null;
  }
  return (
    // No arrow in the Android app on these pages (owner 2026-10-02 — the phone's own back does it; globals.css).
    <div data-page-back="" data-app-no-back={APP_NO_BACK(pathname) ? "" : undefined} className="mb-3 flex md:mb-4">
      <BackButton fallback="/" />
    </div>
  );
}
