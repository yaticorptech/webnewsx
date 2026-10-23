import type { LucideIcon, LucideProps } from "lucide-react";
import { forwardRef, useId } from "react";

/**
 * The Market icon (owner 2026-10-23, from their reference): solid bars on a chart's axes with a rising zig-zag arrow
 * cut through them. Drawn in `currentColor` and sized like a lucide icon, so it drops in wherever one goes (`size-5`,
 * `strokeWidth` — which here sets the arrow's weight).
 */
export const MarketIcon = forwardRef<SVGSVGElement, LucideProps>(function MarketIcon({ strokeWidth = 2, className, ...props }, ref) {
  const mask = useId();
  const weight = Number(strokeWidth);
  return (
    <svg ref={ref} viewBox="0 0 24 24" width={24} height={24} fill="none" className={className} {...props}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          {/* The arrow's channel through the bars. */}
          <path d="M5 18.5 10 13l3.5 3.5L19 10" stroke="#000" strokeWidth={weight + 2.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="m15.5 8.2 4.8-1.2-1.2 4.8" stroke="#000" strokeWidth={weight + 2.4} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      {/* Axes. */}
      <path d="M3 3v18h18" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
      {/* Bars, with the arrow cut out of them. */}
      <g fill="currentColor" mask={`url(#${mask})`}>
        <rect x="5.5" y="10.5" width="2.6" height="8" rx="0.4" />
        <rect x="9.4" y="6.5" width="2.6" height="12" rx="0.4" />
        <rect x="13.3" y="10" width="2.6" height="8.5" rx="0.4" />
        <rect x="17.2" y="4" width="2.6" height="14.5" rx="0.4" />
      </g>
      {/* The arrow itself. */}
      <path d="M5 18.5 10 13l3.5 3.5L19 10" stroke="currentColor" strokeWidth={weight * 0.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="m15.5 8.2 4.8-1.2-1.2 4.8" stroke="currentColor" strokeWidth={weight * 0.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}) as LucideIcon;
