import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { BackButton } from "./back-button";

/**
 * Slim white masthead for pages outside the app shell (root 404/error, legal, style guide), opening with the
 * label-less back arrow (owner rule 2026-09-25: the previous page, else the feed).
 */
export function MinimalHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 md:h-18 lg:px-8 2xl:px-10">
        <BackButton fallback="/" />
        <Link href="/" aria-label="WebNEWS home" className="flex shrink-0 rounded-md outline-offset-4">
          <BrandLockup size="2xs" align="start" className="sm:lockup-xs" />
        </Link>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
