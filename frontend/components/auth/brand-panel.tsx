"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { PulseDot } from "@/components/ui/pulse-dot";
import { NewsGlobe } from "./news-globe";

export type BrandPanelCopy = { kicker: string; title: ReactNode; lede: ReactNode };

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Left half of the auth split screen (≥1024px), white (owner 2026-10-02 — the same in dark mode, so the Earth and its
 * "WebNEWS" band always sit on white): the full lockup, the photo-real 3D Earth you can drag to spin (NewsGlobe: news
 * arcs, the "WebNEWS" band, the logo's bars in 3D), and the page's kicker, headline and lede (owner 2026-09-29: no live
 * headlines card). The copy layer lets drags through to the Earth (only the logo link takes clicks).
 */
export function BrandPanel({ copy }: { copy: BrandPanelCopy }) {
  return (
    <aside
      aria-label="WebNEWS"
      // Always light ink in here, even in dark mode (the copy's tokens and the tagline's shine).
      className="sticky top-0 hidden h-dvh min-h-160 flex-col overflow-hidden border-r border-[#ececef] bg-white text-ink [--ink:#16181d] [--ink-2:#3a3f47] [--color-ink:#16181d] [--color-ink-2:#3a3f47] lg:flex"
    >
      {/* A soft sky-blue haze behind the Earth, then the 3D scene. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_42%_at_52%_36%,rgb(120_170_255/0.18),transparent),radial-gradient(40%_30%_at_20%_85%,rgb(227_6_19/0.06),transparent)]"
      />
      <NewsGlobe className="absolute inset-x-0 top-[4%] h-[66%]" />
      {/* The headline stays crisp over the scene. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] bg-linear-to-t from-white via-white/90 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-1 w-full bg-brand" />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-12 pt-12 pb-10 xl:px-16">
        <Link href="/" aria-label="WebNEWS home" className="pointer-events-auto self-start rounded-md outline-offset-8">
          <BrandLockup size="md" align="start" priority />
        </Link>

        <motion.div
          className="mt-auto max-w-lg pt-12"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        >
          <p className="kicker flex items-center gap-2 text-brand">
            <PulseDot size="xs" />
            {copy.kicker}
          </p>
          <h2 className="mt-4 font-wider text-[clamp(2.5rem,3.5vw,3.75rem)] leading-[0.94] font-black tracking-[-0.035em] text-ink">
            {copy.title}
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-2">{copy.lede}</p>
        </motion.div>
      </div>
    </aside>
  );
}
