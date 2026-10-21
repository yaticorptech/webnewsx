import { Ban, Check, Clock3, Sparkles, Undo2 } from "lucide-react";
import { PulseDot } from "@/components/ui/pulse-dot";
import { cn } from "@/lib/utils";
import type { SpotlightState } from "./format";

const COPY: Record<SpotlightState, string> = {
  pending: "Pending",
  active: "Live",
  expired: "Ended",
  declined: "Declined",
  cancelled: "Withdrawn",
};

const DESCRIPTION: Record<SpotlightState, string> = {
  pending: "Waiting for the Editor Desk",
  active: "Spotlight is running",
  expired: "Spotlight has ended",
  declined: "The Editor Desk declined this request",
  cancelled: "You withdrew this request",
};

/** Status chip for a Spotlight order (icon + word, never colour alone). */
export function SpotlightStatusChip({ state, className }: { state: SpotlightState; className?: string }) {
  return (
    <span
      data-spotlight-state={state}
      title={DESCRIPTION[state]}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-bold uppercase leading-none tracking-widest [&_svg]:size-3.5",
        state === "active" && "bg-brand pl-2 text-brand-contrast",
        state === "pending" && "bg-tint text-brand ring-1 ring-tint-border ring-inset",
        state === "expired" && "bg-surface-2 text-ink-2 ring-1 ring-border ring-inset",
        (state === "declined" || state === "cancelled") && "bg-surface text-muted ring-1 ring-border ring-inset",
        className,
      )}
    >
      {state === "active" && <PulseDot size="xs" tone="white" />}
      {state === "pending" && <Clock3 aria-hidden />}
      {state === "expired" && <Check aria-hidden />}
      {state === "declined" && <Ban aria-hidden />}
      {state === "cancelled" && <Undo2 aria-hidden />}
      {COPY[state]}
      <span className="sr-only">: {DESCRIPTION[state]}</span>
    </span>
  );
}

/** Round red mark used as the Spotlight section/sheet icon. */
export function SpotlightMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_8px_20px_-8px_rgb(227_6_19/0.6)] [&_svg]:size-5",
        className,
      )}
    >
      <Sparkles strokeWidth={2.25} />
    </span>
  );
}
