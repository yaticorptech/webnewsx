import { House, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { cn } from "@/lib/utils";

type StatusViewProps = {
  /** Big display line (e.g. the 404 numerals). */
  display: ReactNode;
  kicker: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  footnote?: ReactNode;
  className?: string;
};

/** Shared layout for 404 / error pages: huge wide numerals, kicker, headline, actions. */
function StatusView({ display, kicker, title, description, actions, footnote, className }: StatusViewProps) {
  return (
    <div className={cn("relative flex flex-col items-center px-2 py-12 text-center sm:py-20", className)}>
      <div
        aria-hidden
        className="flex items-center gap-[0.06em] font-wide text-[clamp(5.5rem,24vw,10rem)] font-black leading-none tracking-[-0.04em] text-ink"
      >
        {display}
      </div>
      <p className="kicker mt-8 flex items-center gap-2 text-brand-strong">
        <PulseDot size="xs" />
        {kicker}
      </p>
      <h1 className="mt-3 max-w-lg font-wide text-2xl font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[2rem]">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">{description}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {footnote && <p className="mt-6 font-mono text-[0.6875rem] text-faint">{footnote}</p>}
    </div>
  );
}

/** "4 ≡ 4": the zero is the speed-lines mark. */
export function NotFoundView({ className }: { className?: string }) {
  return (
    <StatusView
      className={className}
      display={
        <>
          <span>4</span>
          <SpeedBarsSvg className="h-[0.7em] w-auto text-brand" />
          <span>4</span>
        </>
      }
      kicker="Off the wire"
      title="This story isn’t on the wire"
      description="The page you’re looking for was moved, deleted, or never published. The latest stories are one tap away."
      actions={
        <Button href="/" size="lg" leftIcon={<House aria-hidden />}>
          Back to the feed
        </Button>
      }
    />
  );
}

export type ErrorViewProps = {
  /** Re-fetch and re-render the failed segment (Next's `retry`). */
  onRetry?: () => void;
  digest?: string;
  className?: string;
};

export function ErrorView({ onRetry, digest, className }: ErrorViewProps) {
  return (
    <StatusView
      className={className}
      display={
        <>
          <span className="text-outline [--outline-w:2px]">5</span>
          <SpeedBarsSvg className="h-[0.7em] w-auto text-brand" />
          <span className="text-outline [--outline-w:2px]">0</span>
        </>
      }
      kicker="Signal lost"
      title="Something went wrong on our side"
      description="We couldn’t load this page. Check your connection or try again in a moment."
      actions={
        <>
          {onRetry && (
            <Button size="lg" onClick={onRetry} leftIcon={<RotateCcw aria-hidden />}>
              Try again
            </Button>
          )}
          <Button href="/" size="lg" variant="outline">
            Go to the feed
          </Button>
        </>
      }
      footnote={digest ? `Reference: ${digest}` : undefined}
    />
  );
}

/** Generic reading-column placeholder (heading + a card of text) for pages without a bespoke loading UI. */
export function ColumnPageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-muted">
        <SpeedLinesLoader size="sm" label={null} />
        <span className="kicker">{label}</span>
      </div>
      <Skeleton className="h-10 w-2/3 rounded-md" />
      <div className="card flex flex-col gap-5 p-6">
        <SkeletonText lines={3} />
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
