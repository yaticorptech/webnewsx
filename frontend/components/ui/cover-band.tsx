import type { ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

/**
 * The red cover band (redesign 2026-10-07, like a Facebook cover): the brand gradient with thin diagonal speed lines,
 * the logo's three bars large at the right and a soft light at the top left. Static — an endless animation here cost
 * phones smooth scrolling. Size and corners come from `className`; `children` sit on top (e.g. a label).
 * Profiles, communities and the Newsroom.
 */
export function CoverBand({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(47deg, transparent 0 22px, rgb(255 255 255 / 0.1) 22px 24px, transparent 24px 58px), radial-gradient(55% 90% at 12% 0%, rgb(255 255 255 / 0.28), transparent), linear-gradient(115deg, #ff2b3a 0%, #e30613 40%, #a8000e 75%, #6d000a 100%)",
        }}
      />
      <SpeedBarsSvg className="pointer-events-none absolute top-1/2 -right-6 -z-10 h-[135%] w-auto -translate-y-1/2 text-white/12 sm:-right-2" />
      {children}
    </div>
  );
}
