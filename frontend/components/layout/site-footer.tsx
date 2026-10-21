import { cn } from "@/lib/utils";
import { SocialLinks } from "./social-links";

export type SiteFooterProps = {
  /** `full` — the end of a page (article, profile, /about, legal, auth); `compact` — the ≥1280px right rail. */
  variant?: "full" | "compact";
  className?: string;
};

/**
 * The end of a page: WebNEWS's social icons only (owner 2026-10-05: no footer, no address — just the social icons).
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
    <footer aria-label="Site" className={cn("flex justify-center py-8", className)}>
      <SocialLinks />
    </footer>
  );
}
