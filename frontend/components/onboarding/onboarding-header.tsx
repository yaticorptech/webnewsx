import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { DatelineClock } from "@/components/layout/dateline-clock";

/**
 * Masthead for /onboarding: the lockup (tagline under the logo), the live dateline (≥640px) and a
 * way out (log out / switch account, ≥640px — smaller screens get it under the form).
 */
export function OnboardingHeader() {
  return (
    <header className="relative border-b border-border bg-surface">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
      <div className="mx-auto flex h-16 max-w-275 items-center gap-3 px-4 sm:px-6 md:h-18">
        <Link href="/" aria-label="WebNEWS home" className="rounded-md outline-offset-4">
          <BrandLockup size="xs" align="start" priority />
        </Link>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <DatelineClock variant="short" className="hidden sm:inline-flex" />
          <LogoutButton variant="ghost" size="sm" label="Log out" className="hidden text-muted hover:text-brand sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}
