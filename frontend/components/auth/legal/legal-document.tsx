import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { InfoPagesNav } from "@/components/layout/info-pages-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { LegalToc } from "./legal-toc";

export type LegalSection = { id: string; title: string; body: ReactNode };

export type LegalDocumentProps = {
  title: string;
  lede: ReactNode;
  version: string;
  updated: string;
  /** "At a glance" plain-language summary bullets. */
  summary: ReactNode[];
  sections: LegalSection[];
  current: "terms" | "privacy";
};


/**
 * /terms and /privacy (owner 2026-10-02: like About — in the site's shell, full page width, `data-grid-page`): the pink
 * hero with the title, version and links to the other pages (About · Terms · Privacy · Contact us), then a scroll-spy
 * contents rail on the left, the numbered sections in the middle, and the plain-language "At a glance" summary on the
 * right (≥1280px; above the sections on narrower screens), and the site footer.
 */
export function LegalDocument({ title, lede, version, updated, summary, sections, current }: LegalDocumentProps) {
  const toc = sections.map(({ id, title: sectionTitle }) => ({ id, title: sectionTitle }));

  const glance = (
    <section aria-labelledby="at-a-glance" className="panel-tint relative overflow-hidden p-5 sm:p-7">
      <h2 id="at-a-glance" className="kicker flex items-center gap-2 text-brand">
        <SpeedBarsSvg className="h-[0.8rem] w-auto" />
        At a glance
      </h2>
      <ul className="mt-4 grid gap-3">
        {summary.map((item, index) => (
          <li
            key={index}
            className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink"
          >
            <span aria-hidden className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-brand" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-muted">This summary is for convenience. The sections below are the binding text.</p>
    </section>
  );

  return (
    <article data-grid-page="" className="flex flex-col gap-10 sm:gap-12 lg:gap-14">
      <header className="panel-tint relative isolate overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14 lg:py-16">
        <SpeedBarsSvg className="pointer-events-none absolute -right-8 -bottom-6 -z-10 w-40 text-brand opacity-[0.07] sm:w-56 lg:w-80" />
        <Link href="/" aria-label="WebNEWS home" className="inline-flex rounded-md outline-offset-4">
          <BrandLockup size="xs" className="sm:lockup-sm" />
        </Link>
        <p className="kicker mt-8 text-brand-strong">Legal</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-[clamp(1.75rem,1.2rem+2.4vw,3.5rem)] leading-[1.06] font-black tracking-[-0.02em] text-ink font-wide">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-2 sm:text-base lg:text-lg">{lede}</p>
        <dl className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
          <div className="flex items-center gap-1.5 rounded-full border border-tint-border bg-surface px-3 py-1.5">
            <dt className="text-muted">Last updated</dt>
            <dd className="text-ink">
              <time dateTime={version}>{updated}</time>
            </dd>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-tint-border bg-surface px-3 py-1.5">
            <dt className="text-muted">Version</dt>
            <dd className="text-ink tabular-nums">{version}</dd>
          </div>
        </dl>
        <InfoPagesNav current={current} className="mt-7" />
      </header>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[15rem_minmax(0,1fr)_22rem] xl:gap-14">
        <aside className="hidden lg:block">
          <LegalToc items={toc} className="no-scrollbar sticky top-[calc(var(--nav-h)+1.5rem)] max-h-[calc(100dvh-var(--nav-h)-3rem)] overflow-y-auto pb-6" />
        </aside>

        <div className="min-w-0">
          <details className="group card mb-8 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronDown aria-hidden className="size-4 text-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ol className="border-t border-border px-4 py-3">
              {toc.map((item, index) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="flex gap-2.5 py-1.5 text-sm text-muted hover:text-brand">
                    <span className="w-5 shrink-0 font-wide text-[0.6875rem] leading-5 font-black text-brand">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {/* Narrower than 1280px the summary leads the text; wider, it sits in the right-hand column. */}
          <div className="xl:hidden">{glance}</div>

          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="mt-10 scroll-mt-[calc(var(--nav-h)+1.5rem)] border-t border-border pt-10 first-of-type:xl:mt-0 first-of-type:xl:border-t-0 first-of-type:xl:pt-0"
            >
              <h2
                id={`${section.id}-title`}
                className="flex items-baseline gap-3 font-wide text-[1.375rem] leading-tight font-extrabold tracking-[-0.015em] text-ink sm:text-[1.625rem]"
              >
                <span className="font-wider text-[0.8em] font-black text-brand tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </h2>
              <div className="prose-news mt-4 max-w-none font-sans text-base leading-[1.7] text-ink-2 sm:text-[1.0625rem] [&_h3]:mt-7 [&_h3]:text-[1.05em] [&_strong]:text-ink">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-[calc(var(--nav-h)+1.5rem)]">{glance}</div>
        </aside>
      </div>

      <SiteFooter className="rounded-2xl border" />
    </article>
  );
}
