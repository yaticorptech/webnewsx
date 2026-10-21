import { House } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SpeedLines } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";

/**
 * Branded 404 for unknown (or not yet onboarded) usernames: a blank press card stamped
 * "NOT ON FILE", then the usual kicker / headline / way back.
 */
export function ProfileNotFound() {
  return (
    <div className="flex flex-col items-center px-1 py-8 text-center sm:py-14">
      <div
        aria-hidden
        className="relative w-full max-w-88 overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface text-left shadow-card"
      >
        <div className="flex items-center justify-between border-b border-dashed border-border-strong px-4 py-2.5">
          <span className="kicker flex items-center gap-2 text-muted">
            <SpeedLines tone="muted" className="text-[0.8rem]" />
            Press card
          </span>
          <Logo height={10} alt="" className="opacity-50" />
        </div>
        <div className="flex items-center gap-4 p-4">
          <div className="flex size-20 shrink-0 items-center justify-center bg-surface-2 font-wider text-4xl font-black text-faint rounded-full">
            ?
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className="h-4 w-4/5 rounded-sm bg-surface-2" />
            <span className="h-3 w-1/2 rounded-sm bg-surface-2" />
            <span className="h-2.5 w-2/3 rounded-sm bg-surface-2" />
          </div>
        </div>
        {/* Rubber stamp across the card. */}
        <span className="absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 -rotate-10 whitespace-nowrap border-3 border-brand bg-surface/80 px-3 py-1 font-wider text-lg font-black uppercase tracking-[0.2em] text-brand outline-1 outline-offset-2 outline-brand outline-solid backdrop-blur-[1px] sm:text-xl">
          Not on file
        </span>
      </div>

      <p className="kicker mt-10 flex items-center gap-2 text-brand">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-brand" />
        No byline
      </p>
      <h1 className="mt-3 max-w-lg font-wide text-2xl font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[2rem]">
        No one files under that name
      </h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        The username may have changed, or the account hasn’t finished setting up. The latest stories are one tap away.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button href="/" size="lg" leftIcon={<House aria-hidden />}>
          Back to the feed
        </Button>
      </div>
    </div>
  );
}
