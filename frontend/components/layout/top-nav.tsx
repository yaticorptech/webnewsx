import { LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { MastheadRow, MastheadUtility } from "./masthead-utility";
import { MessagesButton } from "@/components/messages/messages-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchButton } from "@/components/search/site-search";
import { Button } from "@/components/ui/button";
import { ADMIN_HOME } from "@/lib/admin-home";
import type { ViewerUser } from "@/lib/shared/contracts";
import { CategoryNav } from "./category-nav";
import { LanguageButton } from "./language-button";
import { LayoutSwitch } from "./layout-switch";
import { MoreMenu } from "./more-menu";
import { NavFrame } from "./nav-frame";
import { publishActionFor } from "./publish-action";
import { UserMenu } from "./user-menu";

export type MastheadProps = {
  viewer: ViewerUser | null;
  /** An admin browsing as a visitor ("Visit site"): "Admin panel" instead of Log in / the account menu. */
  adminVisit?: boolean;
};

/**
 * The top bar (redesign 2026-10-07: Instagram / Facebook / YouTube mix) — one row at every width:
 * - phones / tablets: the wordmark · the grid / reels switch · languages · bell · messages · account (signed out:
 *   Log in on tablets, the ≡ menu); tablets also get the search icon. Phones search and post from the bottom bar.
 * - ≥1024px: the wordmark over the side menu's column · then at the right the search icon (owner 2026-10-07: no
 *   search bar) · Publish (Reporters and the Editor Desk, publishActionFor) · languages · bell · messages · avatar +
 *   account menu. The grid / reels switch moves to the end of the category chips.
 * Under it, on feed pages only, the category chips (category-nav.tsx). The bar sticks; phones slide it away while
 * scrolling down (nav-frame.tsx).
 */
export function Masthead({ viewer, adminVisit = false }: MastheadProps) {
  const username = viewer?.onboarded ? viewer.username : null;
  const publish = publishActionFor(viewer);

  return (
    <NavFrame chips={<CategoryNav trail={<LayoutSwitch squared />} />}>
      {/* Desktop: no rules inside the masthead (owner 2026-10-15) — the section menu's own line closes it. */}
      <div className="border-b border-border lg:border-b-0">
        {/* overflow-x-clip: on the narrowest phones nothing in the bar may widen the page (owner 2026-10-07: "not
            responsive"); the wordmark shrinks with the screen and the languages icon steps aside under 340px. */}
        <MastheadRow>
          {/* ≥1024px a newspaper masthead (owner 2026-10-15): a utility row — edition, English, date and last update,
              weather on the left; the icons on the right as before — then the logo centred.
              Phones unchanged. */}
          <MastheadUtility />
          {/* The lockup — wordmark with "• PULSE OF THE PUBLIC" under it (owner 2026-10-08: "where is the tagline?") — in
              the left corner at every width, set a little in (it shrinks with the screen on phones). Owner 2026-10-08:
              tried centred on the screen, then put back here ("where it was before"). */}
          <Link
            href="/"
            aria-label="WebNEWS home"
            // A little in from the corner (owner 2026-10-08: "not too much corner").
            // ≥1024px at least as wide as the side menu (so the page lines up under it) — never narrower than the lockup:
            // on pages with the slim 5rem menu (the composer, a story) a fixed width squeezed the wordmark to a sliver.
            className="flex min-w-0 shrink rounded-md py-1 pl-1.5 outline-offset-2 sm:pl-2.5 lg:col-span-2 lg:row-start-2 lg:shrink-0 lg:self-center lg:justify-self-center lg:px-2"
          >
            <BrandLockup
              size="2xs"
              align="center"
              priority
              fit
              // Phones a little bigger (owner 2026-10-09: "top nav bar a little bigger").
              className="[--lockup-h:clamp(11px,3.9vw,15px)] [--tag-gap:2px] [--tag-size:clamp(5.5px,1.9vw,7.5px)] max-sm:[--lockup-h:clamp(13px,4.6vw,19px)] max-sm:[--tag-gap:2.5px] max-sm:[--tag-size:clamp(6.5px,2.3vw,9.5px)] md:lockup-xs lg:[--lockup-h:44px] lg:[--tag-gap:9px] lg:[--tag-size:12px] lg:[--tag-track:0.42em] lg:in-data-[masthead=compact]:[--lockup-h:30px] lg:in-data-[masthead=compact]:[--tag-gap:5px] lg:in-data-[masthead=compact]:[--tag-size:9px] lg:in-data-[masthead=compact]:[--tag-track:0.3em]"
            />
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 min-[380px]:gap-1 sm:gap-1.5 lg:col-start-2 lg:row-start-1 lg:justify-self-end">
            {/* Phones too (owner 2026-10-09: the grid / reels switch here, no search or "+" in the bar). */}
            <LayoutSwitch className="mr-0.5 lg:hidden" />
            {/* Tablets and computers: a search icon (owner 2026-10-07: "a small icon is enough", not a search bar); phones
                have the bottom bar's Explore tab. */}
            <SearchButton className="max-md:hidden" />
            {adminVisit ? (
              <>
                <LanguageButton />
                <Button href={ADMIN_HOME} size="sm" leftIcon={<LayoutDashboard aria-hidden />} className="px-4 max-md:hidden">
                  Admin panel
                </Button>
                <MoreMenu className="lg:hidden" />
              </>
            ) : username ? (
              <>
                {/* Just the "+" (owner 2026-10-07: no "Publish" text). Readers get it too (owner 2026-10-08): the composer
                    then asks them for a Press Pass. */}
                {(publish.kind === "publish" || publish.kind === "press-pass") && (
                  <Link
                    href="/publish"
                    aria-label="Publish a new story"
                    title="New story"
                    data-tour="publish"
                    // In line with the other icons (owner 2026-10-10: the solid red, glowing circle "looks odd"): a soft pink
                    // circle with a red "+", solid red on hover.
                    className="hidden size-10 items-center justify-center rounded-full bg-tint text-brand transition-colors hover:bg-brand hover:text-brand-contrast md:inline-flex"
                  >
                    <Plus aria-hidden className="size-5" strokeWidth={2.5} />
                  </Link>
                )}
                {/* Hidden on profile pages on phones (owner 2026-10-09; globals.css [data-profile-hide]). */}
                <span data-profile-hide="" className="contents">
                  <LanguageButton className="max-[339px]:hidden" />
                </span>
                {/* Not on profile pages on phones (owner 2026-10-16; globals.css [data-profile-hide-phone]). */}
                <span data-profile-hide-phone="" className="contents">
                  <NotificationBell />
                </span>
                {/* Phones too (owner 2026-10-10: back in the top bar; the bottom bar has Reels in its place). */}
                <span data-profile-hide="" className="contents">
                  <MessagesButton />
                </span>
                <UserMenu
                  username={username}
                  name={viewer?.name ?? username}
                  image={viewer?.image ?? null}
                  role={viewer?.role}
                  reporterLevel={viewer?.reporterLevel}
                  unreadNotices={viewer?.unreadNotices ?? 0}
                />
              </>
            ) : viewer ? (
              <>
                <LanguageButton />
                <Button href="/onboarding" size="sm">
                  Finish profile
                </Button>
              </>
            ) : (
              <>
                <LanguageButton className="max-[339px]:hidden" />
                {/* Logged out, phones and the app (owner 2026-10-16): no chat icon; computers keep it (asks to log in). */}
                <MessagesButton className="max-md:hidden" />
                <Button href="/login" size="sm" className="ml-1 px-5 max-md:hidden">
                  Sign in
                </Button>
                <MoreMenu className="md:hidden" />
              </>
            )}
          </div>
        </MastheadRow>
      </div>
    </NavFrame>
  );
}

/** @deprecated Renamed to `Masthead` (2026-09-24 retheme). */
export const TopNav = Masthead;
