"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SpeedBarsSvg, SpeedLines } from "@/components/brand/speed-lines";
import { buttonClasses } from "@/components/ui/button";
import { cn, initialsOf } from "@/lib/utils";
import { PRESS_STEPS } from "./press-pass-model";

export type PressPassPromoProps = {
  name: string;
  image: string | null;
  /** The viewer's pass was revoked by the Editor Desk (they can't re-apply). */
  revoked?: boolean;
  className?: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "Get your Press Pass" — the Reader's entry point to publishing, at the front of their own profile
 * (SPEC §3.2, §3.11). A tilted mini pass with their photo lands in, beside how it works and the CTA.
 */
export function PressPassPromo({ name, image, revoked = false, className }: PressPassPromoProps) {
  const reduce = useReducedMotion();
  if (revoked) return <RevokedNote className={className} />;
  return (
    <motion.section
      aria-labelledby="press-pass-promo-title"
      data-testid="press-pass-promo"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
      className={cn("panel-tint relative isolate overflow-hidden", className)}
    >
      <SpeedBarsSvg className="pointer-events-none absolute -bottom-12 -right-12 -z-10 w-56 text-brand opacity-[0.05]" />
      <div className="grid items-center gap-5 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8 sm:px-7 sm:py-7">
        <div className="min-w-0">
          <p className="kicker flex items-center gap-2 text-brand">
            <SpeedLines className="text-[0.8rem]" />
            You&rsquo;re a Reader
          </p>
          <h2
            id="press-pass-promo-title"
            className="mt-2 font-wider text-[1.625rem] font-black leading-none tracking-[-0.02em] text-ink sm:text-[2rem]"
          >
            Get your Press Pass
          </h2>
          <p className="mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-ink-2">
            Want to publish? Reporters file stories to every live feed. Apply in two short steps — your pass is issued the
            moment you sign the Reporter Pledge.
          </p>
          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="How it works">
            {PRESS_STEPS.map((step, index) => (
              <li
                key={step.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-tint-border bg-surface px-2.5 py-1 text-xs font-bold text-ink-2"
              >
                <span className="font-wide text-[0.625rem] font-black tabular-nums text-brand">{String(index + 1).padStart(2, "0")}</span>
                {step.label}
              </li>
            ))}
          </ol>
          <Link href="/press-pass" className={buttonClasses({ size: "lg", className: "group mt-5 max-sm:w-full" })}>
            Get your Press Pass
            <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <MiniPass name={name} image={image} reduce={Boolean(reduce)} />
      </div>
    </motion.section>
  );
}

/** Decorative tilted mini credential (hidden from assistive tech). */
function MiniPass({ name, image, reduce }: { name: string; image: string | null; reduce: boolean }) {
  return (
    <motion.div
      aria-hidden
      initial={reduce ? false : { opacity: 0, rotate: -18, y: 18, scale: 0.9 }}
      animate={{ opacity: 1, rotate: -6, y: 0, scale: 1 }}
      whileHover={reduce ? undefined : { rotate: -2, y: -4 }}
      transition={{ type: "spring", stiffness: 240, damping: 20, delay: reduce ? 0 : 0.25 }}
      className="relative mx-auto w-52 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop max-sm:order-first sm:w-56"
    >
      <div className="flex items-center justify-between border-b border-tint-border bg-tint px-3 py-2">
        <span className="kicker flex items-center gap-1.5 text-[0.5625rem] text-brand">
          <SpeedLines className="text-[0.6rem]" />
          Press pass
        </span>
        <Logo height={9} alt="" />
      </div>
      <div className="flex items-center gap-3 px-3 pb-3 pt-3.5">
        <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint ring-2 ring-brand">
          <span className="font-wider text-sm font-black text-brand">{initialsOf(name)}</span>
          {image && <img src={image} alt="" width={48} height={48} className="absolute inset-0 size-full object-cover" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate font-wider text-sm font-black leading-none text-ink">{name}</span>
          <span className="h-1.5 w-3/4 rounded-full bg-tint-3" />
          <span className="h-1.5 w-1/2 rounded-full bg-tint-3" />
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-tint-border bg-tint/60 px-3 py-2">
        <span className="font-wide text-[0.625rem] font-extrabold tracking-[0.08em] text-ink">WN-KA-••••••</span>
        <span className="rounded border-2 border-muted px-1 py-px font-wider text-[0.5rem] font-black uppercase tracking-[0.18em] text-muted">
          Trainee
        </span>
      </div>
      {!reduce && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/70 to-transparent"
          initial={{ x: "0%" }}
          animate={{ x: "400%" }}
          transition={{ delay: 0.9, duration: 1.1, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
}

/** A Reader whose pass the Editor Desk revoked: no application, just where to look. */
function RevokedNote({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="press-pass-revoked-title"
      data-testid="press-pass-promo"
      data-state="revoked"
      className={cn("card flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6", className)}
    >
      <div className="min-w-0 flex-1">
        <p className="kicker text-muted">Press Pass</p>
        <h2 id="press-pass-revoked-title" className="mt-1 font-wide text-lg font-extrabold text-ink">
          Your Press Pass was revoked
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">You&rsquo;re a Reader again. Only the Editor Desk can reinstate it.</p>
      </div>
      <Link href="/press-pass" className={buttonClasses({ variant: "outline", className: "shrink-0 self-start sm:self-auto" })}>
        View your pass
      </Link>
    </section>
  );
}
