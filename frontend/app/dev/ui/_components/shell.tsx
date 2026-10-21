"use client";

import { DatelineClock } from "@/components/layout/dateline-clock";
import { MoreMenu } from "@/components/layout/more-menu";
import { SiteFooter } from "@/components/layout/site-footer";
import { SocialLinks } from "@/components/layout/social-links";
import { CategoryNav } from "@/components/layout/category-nav";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Demo, Section } from "./section";

/** Masthead + footer pieces (SPEC §3.2, §3.10). */
export function ShellSection() {
  return (
    <Section
      id="shell"
      title="Shell"
      lead="Masthead pieces modelled on the old platform — live dateline, section tabs, the pink breaking bar — plus the office block, social links and site footer."
    >
      <Demo label="Dateline clock · full (≥1024) · short (768–1023) · time (<768)" className="flex flex-col gap-4">
        <DatelineClock variant="full" />
        <DatelineClock variant="short" />
        <DatelineClock variant="time" />
      </Demo>
      <Demo label="Category nav (Karnataka ▾ and More ▾ open panels)" surface={false}>
        <div className="card">
          <CategoryNav className="rounded-2xl border-t-0" />
        </div>
      </Demo>
      <Demo label="Breaking bar" surface={false}>
        <div className="flex h-11 items-center gap-4 overflow-hidden rounded-xl border border-tint-3 bg-tint-2 px-2.5">
          <span className="kicker inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-white">
            <PulseDot size="xs" tone="white" />
            Live
          </span>
          <span className="truncate text-[0.8125rem] font-semibold text-ink">
            <span className="mr-2 text-[0.6875rem] font-extrabold text-brand-strong">3m</span>
            Night buses return to the harbour district after six years
          </span>
        </div>
      </Demo>
      <div className="grid gap-6 lg:grid-cols-3">
        <Demo label="Social links" className="flex flex-col gap-5">
          <SocialLinks />
          <SocialLinks size="sm" />
        </Demo>
        <Demo label="More menu (logged-out phones)" className="flex items-start">
          <MoreMenu />
        </Demo>
      </div>
      <Demo label="Site footer · compact (right rail)" className="max-w-80">
        <SiteFooter variant="compact" />
      </Demo>
      <Demo label="Site footer · full" surface={false}>
        <SiteFooter className="rounded-2xl border" />
      </Demo>
    </Section>
  );
}
