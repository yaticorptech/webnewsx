"use client";

import { BrandLockup, TaglineText } from "@/components/brand/brand-lockup";
import { Logo } from "@/components/brand/logo";
import { SpeedLines } from "@/components/brand/speed-lines";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Demo, Section } from "./section";

export function BrandSection() {
  return (
    <Section id="brand" title="Brand" lead="Wordmark with the tagline as live text, the owner-supplied icon, and the three motifs.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Lockup · tagline always under the logo (lg)" className="flex min-h-48 items-center justify-center">
          <BrandLockup size="lg" className="max-w-full" />
        </Demo>
        <Demo label="Lockup · on the pink tint panel (md)" surface={false}>
          <div className="panel-tint flex min-h-48 items-center justify-center p-6">
            <BrandLockup size="md" className="max-w-full" />
          </div>
        </Demo>
      </div>
      <Demo label="Lockup sizes · 2xs (phone bar) → md (desktop masthead)" className="flex flex-wrap items-end justify-center gap-x-10 gap-y-8">
        {(["2xs", "xs", "sm", "md"] as const).map((size) => (
          <div key={size} className="flex flex-col items-center gap-3">
            <BrandLockup size={size} />
            <span className="font-mono text-[0.6875rem] text-muted">{size}</span>
          </div>
        ))}
      </Demo>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Demo label="Nav wordmark" className="flex h-32 items-center justify-center">
          <Logo height={22} />
        </Demo>
        <Demo label="Tagline" className="flex h-32 items-center justify-center">
          <TaglineText className="text-[0.625rem]" />
        </Demo>
        <Demo label="App icon" className="flex h-32 items-center justify-center gap-4">
          <img src="/brand/icon.svg" alt="WebNEWS icon" width={56} height={56} />
          <img src="/icons/maskable-512.png" alt="Maskable icon" width={56} height={56} className="rounded-xl" />
        </Demo>
        <Demo label="Pulse dot · heartbeat" className="flex h-32 items-center justify-center gap-5">
          <PulseDot size="xs" />
          <PulseDot size="sm" />
          <PulseDot size="md" />
          <PulseDot size="lg" />
          <span className="flex items-center rounded-md bg-brand px-2 py-1.5">
            <PulseDot size="xs" tone="white" />
          </span>
          <PulseDot size="md" pulse={false} tone="ink" />
        </Demo>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Demo label="Speed lines · glyph" className="flex flex-col gap-4">
          <p className="kicker flex items-center gap-2">
            <SpeedLines /> Section kicker
          </p>
          <p className="flex items-center gap-3 font-wide text-2xl font-extrabold">
            <SpeedLines /> Headline
          </p>
          <p className="flex items-center gap-3 text-muted">
            12 <SpeedLines tone="muted" /> 340 <SpeedLines tone="muted" /> 18
          </p>
        </Demo>
        <Demo label="Speed lines · rule" className="flex flex-col justify-center gap-6">
          <SpeedLines variant="rule" />
          <SpeedLines variant="rule" tone="muted" />
        </Demo>
        <Demo label="Speed lines · bars" className="flex items-center justify-center">
          <SpeedLines variant="bars" className="w-32" />
        </Demo>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Demo label="Diagonal slice (.slice-tr) · subtle, covers only" className="grid grid-cols-2 gap-4">
          <div className="aspect-video rounded-xl bg-brand slice-tr [--slice:1.75rem]" />
          <div className="aspect-video rounded-xl border border-tint-border bg-tint slice-tr [--slice:1.75rem]" />
        </Demo>
        <Demo label="Pills & badges (old-platform style)" className="flex flex-wrap items-center gap-3">
          <span className="kicker inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-white">
            <PulseDot size="xs" tone="white" />
            Live
          </span>
          <span className="rounded-md bg-brand px-2.5 py-1 text-xs font-bold text-white">ಬ್ರೇಕಿಂಗ್</span>
          <span className="kicker text-brand-strong">Category</span>
          <span className="rounded-full border border-tint-border bg-tint px-3 py-1 text-xs font-bold text-brand-strong">
            Draft
          </span>
        </Demo>
      </div>
    </Section>
  );
}

const SWATCHES = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-2", "bg-surface-2"],
  ["surface-3", "bg-surface-3"],
  ["tint", "bg-tint"],
  ["tint-2", "bg-tint-2"],
  ["tint-3", "bg-tint-3"],
  ["tint-border", "bg-tint-border"],
  ["border", "bg-border"],
  ["border-strong", "bg-border-strong"],
  ["ink (text only)", "bg-ink"],
  ["ink-2", "bg-ink-2"],
  ["muted", "bg-muted"],
  ["muted-2", "bg-muted-2"],
  ["brand", "bg-brand"],
  ["brand-hover", "bg-brand-hover"],
  ["brand-strong", "bg-brand-strong"],
  ["brand-bright", "bg-brand-bright"],
  ["success", "bg-success"],
  ["success-soft", "bg-success-soft"],
] as const;

export function TokensSection() {
  return (
    <Section id="tokens" title="Tokens" lead="One light theme (SPEC §2.2) as CSS variables on :root. Tailwind utilities: bg-*, text-*, border-*. Older aliases: faint (small muted text) and brand-strong (= brand).">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SWATCHES.map(([name, cls]) => (
          <li key={name} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className={`h-16 border-b border-border ${cls}`} />
            <p className="px-3 py-2 font-mono text-[0.6875rem] text-muted">--{name}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TypeSection() {
  return (
    <Section id="type" title="Type" lead="Archivo (wide cuts via the wdth axis) for UI and headlines; Source Serif 4 for reading; Noto Sans / Serif Kannada for Kannada.">
      <Demo label="Display · article title (32 → 56px)">
        <p className="font-wide text-display font-black">Night buses return to the harbour district</p>
      </Demo>
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Headline · feed (22 → 28px)">
          <p className="font-wide text-headline font-extrabold">Record September heat pushes the power grid to its limit</p>
          <p className="mt-3 font-wide text-headline font-extrabold text-brand">ಬೆಂಗಳೂರಿನಲ್ಲಿ ದಾಖಲೆಯ ಮಳೆ: ಸಂಚಾರ ಅಸ್ತವ್ಯಸ್ತ</p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
            Excerpt text in Archivo regular — plain, calm, three lines max in the feed before “Continue reading”.
          </p>
        </Demo>
        <Demo label="Kickers, meta & labels">
          <div className="flex flex-col gap-3">
            <p className="kicker text-brand-strong">Kicker · 11px · 0.16em</p>
            <p className="text-xs font-semibold text-muted">3m ago · 4 min read · reuters.com</p>
            <p className="text-sm font-bold">Label 14px bold</p>
            <TaglineText className="text-[0.625rem]" />
          </div>
        </Demo>
      </div>
      <Demo label=".prose-news · article body">
        <div className="prose-news prose-news-dropcap max-w-[68ch]">
          <p>
            The first night bus left the depot at 00:40, eleven minutes late and almost full. For residents of the harbour
            district it was the end of a six-year wait — and, for the city, the start of an experiment that could reshape
            how the whole network runs after dark.
          </p>
          <h2>What changes on Monday</h2>
          <p>
            Three routes will run every twenty minutes between midnight and five. Fares stay the same, and tickets bought
            on the day remain valid until the last bus. <a href="#type">Read the council’s notice</a>.
          </p>
          <blockquote>“We heard the same thing at every meeting: people want to get home safely.”</blockquote>
          <ul>
            <li>Routes N1, N4 and N9 return first.</li>
            <li>Stops are lit and staffed until 1am.</li>
          </ul>
          <h3>What happens next</h3>
          <ol>
            <li>Ridership review after twelve weeks.</li>
            <li>Council vote on a permanent service in spring.</li>
          </ol>
          <hr />
          <p>
            Inline <code>code</code> and <strong>strong emphasis</strong> keep the same rhythm.
          </p>
        </div>
      </Demo>
    </Section>
  );
}
