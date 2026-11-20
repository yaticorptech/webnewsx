import Link from "next/link";
import { cn } from "@/lib/utils";
import { SocialLinks } from "./social-links";

export type SiteFooterProps = {
  /** `full` — the end of a page (article, profile, /about, legal, auth); `compact` — the ≥1280px right rail. */
  variant?: "full" | "compact";
  className?: string;
};

/**
 * The end of a page: WebNewsX's social icons only (owner 2026-10-05: no footer, no address — just the social icons).
 * Server-safe.
 */
export function SiteFooter({ variant = "full", className }: SiteFooterProps) {
  if (variant === "compact") {
    return (
      <footer aria-label="Site" className={cn("px-1", className)}>
        <SocialLinks size="sm" />
      </footer>
    );
  }
  return (
    <footer aria-label="Site" className={cn("flex flex-col items-center gap-3 py-8", className)}>
      <SocialLinks />
      {/* A crawlable path to every story (the feeds load more on scroll, which search engines don't do). */}
      <Link href="/stories" className="text-xs font-semibold text-muted transition-colors hover:text-brand">
        All stories
      </Link>
    </footer>
  );
}
