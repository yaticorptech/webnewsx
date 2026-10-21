import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedBarsSvg, SpeedLines } from "@/components/brand/speed-lines";
import { BackButton } from "@/components/layout/back-button";
import { BrandPanel, type BrandPanelCopy } from "./brand-panel";

export type AuthShellProps = {
  panel: BrandPanelCopy;
  children: ReactNode;
};

/**
 * Split screen for /login, /signup and the password reset pages: the sticky pink brand panel with the 3D globe
 * (≥1024px) + the form column. Below 1024px (owner 2026-10-08: "looks basic" on phones): a WebNEWS-red hero — back
 * arrow, white lockup, the page's kicker and headline over the logo's slanted bars — then the form on a white sheet with
 * rounded top corners that rides up over it. Owner 2026-09-29: no live headlines and no site footer on these pages.
 */
export function AuthShell({ panel, children }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:bg-bg">
      <BrandPanel copy={panel} />
      <AuthHero />

      <div className="relative z-10 -mt-8 flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-[2rem] bg-bg shadow-[0_-14px_36px_-14px_rgb(0_0_0/0.35)] lg:mt-0 lg:rounded-none lg:shadow-none">
        {/* Two soft red glows drifting behind the form (owner 2026-10-02: livelier; still under reduced motion). */}
        <style>{`@keyframes wn-auth-float{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(var(--dx),var(--dy),0) scale(1.12)}}`}</style>
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand/12 blur-3xl animate-[wn-auth-float_14s_ease-in-out_infinite] [--dx:-40px] [--dy:50px] motion-reduce:animate-none"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-20 size-96 rounded-full bg-brand/8 blur-3xl animate-[wn-auth-float_18s_ease-in-out_infinite] [--dx:60px] [--dy:-40px] motion-reduce:animate-none"
        />
        {/* The sheet's grab line (phones). */}
        <span aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-border-strong lg:hidden" />
        <header className="relative hidden h-20 items-center gap-3 px-10 lg:flex">
          {/* The label-less back arrow (owner rule 2026-09-25): the previous page, else the feed. */}
          <BackButton fallback="/" />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 justify-center px-5 pt-6 pb-14 outline-none sm:px-8 sm:pt-8 sm:pb-20 lg:items-center lg:px-10 lg:pt-4"
        >
          <div className="relative w-full max-w-108 animate-fade-up sm:max-w-120 lg:rounded-[1.75rem] lg:border lg:border-border lg:bg-surface/85 lg:p-8 lg:shadow-pop lg:backdrop-blur-md">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * The phones' hero (<1024px): WebNEWS red with the logo's slanted bars as a soft pattern, the back arrow and the
 * lockup in white, then straight to the form (owner 2026-10-16: no clock, no headline). Extra room at the bottom for the
 * sheet to ride over.
 */
function AuthHero() {
  return (
    <section
      aria-label="WebNEWS"
      className="relative overflow-hidden px-5 pt-[calc(var(--safe-top,0px)+0.75rem)] pb-14 text-white sm:px-8 lg:hidden"
    >
      {/* Depth: a lighter glow up top-left, the bars big and faint on the right. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,rgb(255_255_255/0.18),transparent_60%),radial-gradient(70%_60%_at_100%_100%,rgb(0_0_0/0.22),transparent_70%)]" />
      <SpeedBarsSvg className="pointer-events-none absolute -right-10 top-10 w-64 text-white/10 sm:w-80" />

      <div className="relative flex h-12 items-center gap-3">
        <BackButton fallback="/" />
      </div>

      <Link
        href="/"
        aria-label="WebNEWS home"
        // The lockup in white: the wordmark image whitened, the tagline's ink and shine turned white / pale pink.
        className="relative mt-5 inline-flex rounded-md outline-offset-4 [--brand:#ffc2c6] [--color-ink:#fff] [--ink:#fff] [&_img]:brightness-0 [&_img]:invert"
      >
        <BrandLockup size="sm" align="start" priority />
      </Link>
    </section>
  );
}

/** Kicker + headline + lede at the top of an auth form. */
export function AuthHeading({ kicker, title, lede }: { kicker: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div>
      <p className="kicker flex items-center gap-2 text-brand">
        <SpeedLines />
        {kicker}
      </p>
      <h1 className="mt-3 font-wide text-[2rem] leading-[1.02] font-black tracking-tight text-ink sm:text-[2.375rem]">
        {title}
      </h1>
      {lede && <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{lede}</p>}
    </div>
  );
}
