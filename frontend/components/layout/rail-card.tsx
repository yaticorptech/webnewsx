import type { ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

export type RailCardProps = {
  title: string;
  /** Right side of the header (status, date, "See all"…). */
  aside?: ReactNode;
  /** Leading glyph (defaults to the crimson speed lines). */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Right-rail module: a white bordered card (like the old platform's horoscope card) with a
 * crimson glyph + title header and thin grey dividers between rows.
 */
export function RailCard({ title, aside, icon, className, children }: RailCardProps) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 whitespace-nowrap text-[0.9375rem] font-extrabold tracking-[-0.005em] text-ink font-wide">
          <span className="flex text-brand [&_svg]:size-4">{icon ?? <SpeedLines className="text-[0.85rem]" />}</span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
