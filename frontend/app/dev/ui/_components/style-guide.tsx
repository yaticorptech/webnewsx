"use client";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { BrandSection, TokensSection, TypeSection } from "./foundations";
import { ControlsSection } from "./controls";
import { FeedbackSection } from "./feedback";
import { LiveSection } from "./live";
import { OverlaysSection } from "./overlays";
import { ShellSection } from "./shell";

const NAV = [
  ["brand", "Brand"],
  ["shell", "Shell"],
  ["tokens", "Tokens"],
  ["type", "Type"],
  ["controls", "Controls"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback"],
  ["live", "Live & motion"],
] as const;

export function StyleGuide() {
  return (
    <>
      <MinimalHeader>
        <span className="kicker hidden text-muted md:inline">Design system · dev only</span>
      </MinimalHeader>

      <div className="relative overflow-hidden border-b border-tint-border bg-tint">
        <SpeedBarsSvg className="pointer-events-none absolute -right-10 top-1/2 w-136 max-w-[60vw] -translate-y-1/2 text-brand opacity-[0.08] lg:-right-16 lg:max-w-[42vw]" />
        <div className="relative mx-auto flex max-w-300 flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-20">
          <p className="kicker text-brand-strong">WebNEWS · Style guide</p>
          <BrandLockup size="sm" align="start" className="sm:lockup-lg" />
          <p className="max-w-xl text-[0.9375rem] leading-relaxed text-ink-2">
            White and crimson, modelled on the old platform: clean white pages, pink panels, grey rules and crimson
            pills. Three motifs carry the brand: the speed lines from the icon, the diagonal slice from the “N”, and
            the heartbeat pulse dot from the tagline.
          </p>
        </div>
      </div>

      <nav aria-label="Style guide sections" className="sticky top-0 z-40 border-b border-border bg-nav backdrop-blur-xl">
        <ul className="no-scrollbar mx-auto flex max-w-300 gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] font-bold text-muted transition-colors hover:bg-tint-2 hover:text-brand"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" className="mx-auto max-w-300 px-4 pb-24 sm:px-6">
        <BrandSection />
        <ShellSection />
        <TokensSection />
        <TypeSection />
        <ControlsSection />
        <OverlaysSection />
        <FeedbackSection />
        <LiveSection />
      </main>
    </>
  );
}
