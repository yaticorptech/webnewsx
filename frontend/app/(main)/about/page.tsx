import { ArrowRight, IdCard, PenLine, Radio, Send, ShieldCheck, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedLines } from "@/components/brand/speed-lines";
import { publishActionFor, type PublishAction } from "@/components/layout/publish-action";
import { InfoPagesNav } from "@/components/layout/info-pages-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SocialLinks } from "@/components/layout/social-links";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/company";
import { SITE_NAME, TAGLINE } from "@/lib/config";
import { getSiteViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "About",
  description: `${SITE_NAME} — ${TAGLINE}. A news platform where anyone can earn a Press Pass and report, run by ${COMPANY.legalName}.`,
  alternates: { canonical: "/about" },
};

const STEPS = [
  {
    icon: IdCard,
    title: "Get your Press Pass",
    body: "Every account starts as a Reader. Verify who you are, tell us why you report and sign the Reporter Pledge — your pass is issued instantly.",
  },
  {
    icon: PenLine,
    title: "Write and preview",
    body: "Add a cover photo, a clear headline and your story, link your source, and see exactly how readers will see it.",
  },
  {
    icon: Radio,
    title: "Publish — it's live",
    body: "Your first stories pass the Review Desk; after three approvals you're Verified and publish instantly, straight to the top of every open feed.",
  },
] as const;

const VALUES = [
  {
    icon: UsersRound,
    title: "Open to everyone",
    body: "Anyone with a story from their street, city or field can earn a Press Pass and report — in English or Kannada.",
  },
  {
    icon: Radio,
    title: "Live by default",
    body: "New stories, likes and views update in real time, so the feed always shows what's happening now.",
  },
  {
    icon: ShieldCheck,
    title: "Accountable",
    body: "Clear rules against misinformation and hate, takedowns on request, and a grievance contact under Indian law.",
  },
] as const;

/** /about (SPEC §3.10): mission, how it works, what we stand for, office + contact. */
export default async function AboutPage() {
  const cta = aboutCta(publishActionFor(await getSiteViewer()));
  return (
    // Full page width (owner 2026-10-02, data-grid-page): the hero across the screen, the values in two columns.
    <article data-grid-page="" className="flex flex-col gap-10 sm:gap-12 lg:gap-14">
      <header className="panel-tint relative isolate overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14 lg:py-20">
        <SpeedLines
          variant="bars"
          className="pointer-events-none absolute -right-8 -bottom-6 -z-10 w-40 opacity-[0.07] sm:w-56 lg:w-80"
        />
        <BrandLockup size="xs" className="sm:lockup-sm" />
        <p className="kicker mt-8 text-brand-strong">About {SITE_NAME}</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-[clamp(1.75rem,1.2rem+2.4vw,3.5rem)] leading-[1.06] font-black tracking-[-0.02em] text-ink font-wide">
          The news, published by the public.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-2 sm:text-base lg:text-lg">
          {SITE_NAME} is a live, endlessly scrolling feed of stories written by the people who witness them. Everyone
          can read, follow and share; anyone can earn a Press Pass and report — the pulse of the public, in real time.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button href={cta.href} rightIcon={<ArrowRight aria-hidden />}>
            {cta.label}
          </Button>
          <Button href="/" variant="outline">
            Read the feed
          </Button>
        </div>
        <InfoPagesNav current="about" className="mt-7" />
      </header>

      <Section title="How it works">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-full bg-tint-2 text-brand [&_svg]:size-5">
                  <step.icon aria-hidden />
                </span>
                {/* Decorative step numeral (pale pink by design, not text to read): drawn as generated content. */}
                <span
                  aria-hidden
                  data-step={String(i + 1).padStart(2, "0")}
                  className="text-2xl font-black text-tint-border tabular-nums font-wide before:content-[attr(data-step)]"
                />
              </div>
              <h3 className="text-base font-extrabold text-ink font-wide">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="What we stand for">
        <ul className="grid gap-3 md:grid-cols-2">
          {VALUES.map((value) => (
            <li key={value.title} className="card flex gap-4 p-5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-tint-border bg-tint text-brand [&_svg]:size-4.5">
                <value.icon aria-hidden />
              </span>
              <div>
                <h3 className="text-[0.9375rem] font-extrabold text-ink font-wide">{value.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{value.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Contact us">
        <div className="card grid gap-8 p-6 sm:grid-cols-[1fr_auto] sm:p-7">
          <div className="flex flex-col">
            <h3 className="kicker text-muted">Email</h3>
            <a
              href={`mailto:${COMPANY.email}`}
              className="mt-2 w-fit text-[0.9375rem] font-semibold text-brand-strong underline-offset-4 hover:underline"
            >
              {COMPANY.email}
            </a>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Button href="/contact" leftIcon={<Send aria-hidden />}>
              Send us a message
            </Button>
            <p className="kicker mt-2 text-muted">Follow {SITE_NAME}</p>
            <SocialLinks />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Questions about a story, a takedown request or a grievance? Write to{" "}
          <a
            href={`mailto:${COMPANY.email}`}
            className="font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            {COMPANY.email}
          </a>
          . Read our{" "}
          <Link href="/terms" className="font-semibold text-brand-strong underline-offset-4 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-brand-strong underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <SiteFooter className="rounded-2xl border" />
    </article>
  );
}

/** The hero's primary action follows the viewer's role: only Reporters and the Editor Desk are sent to the composer. */
function aboutCta(action: PublishAction): { href: string; label: string } {
  switch (action.kind) {
    case "publish":
      return { href: action.href, label: "Publish a story" };
    case "press-pass":
      return { href: action.href, label: "Get your Press Pass" };
    case "onboard":
      return { href: action.href, label: "Finish your profile" };
    case "login":
      return { href: "/signup", label: "Join WebNEWS" };
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-[-0.01em] text-ink font-wide sm:text-2xl">
        <SpeedLines className="text-[0.8em]" />
        {title}
      </h2>
      {children}
    </section>
  );
}
