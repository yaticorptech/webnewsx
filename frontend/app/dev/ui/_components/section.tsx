import type { ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

export function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-nav border-t border-border py-12 first:border-t-0 sm:py-16">
      <header className="mb-8">
        <h2 id={`${id}-title`} className="flex items-center gap-3 font-wide text-2xl font-extrabold tracking-[-0.015em] sm:text-3xl">
          <SpeedLines className="text-[0.9em]" />
          {title}
        </h2>
        {lead && <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{lead}</p>}
      </header>
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  );
}

export function Demo({ label, children, className, surface = true }: { label: string; children: ReactNode; className?: string; surface?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="kicker text-muted">{label}</p>
      <div className={cn("min-w-0", surface && "rounded-2xl border border-border bg-surface p-5 sm:p-6", className)}>{children}</div>
    </div>
  );
}
