import { cn } from "@/lib/utils";

export type PulseDotProps = {
  /** xs 6 · sm 8 · md 10 · lg 12 px, or `em` = 0.6em (scales with the surrounding text, e.g. the tagline). */
  size?: "xs" | "sm" | "md" | "lg" | "em";
  /** Heartbeat + ripple (live/realtime). Keeps beating under prefers-reduced-motion (owner request). */
  pulse?: boolean;
  /** `brand` crimson · `bright` logo red (tagline, LIVE) · `white` (on crimson) · `ink` · `success`. */
  tone?: "brand" | "bright" | "white" | "ink" | "success";
  /** Screen-reader text, e.g. "Live". Omit for purely decorative dots. */
  label?: string;
  className?: string;
};

const SIZES = { xs: "size-1.5", sm: "size-2", md: "size-2.5", lg: "size-3", em: "size-[0.6em]" } as const;
const TONES = {
  brand: "bg-brand",
  bright: "bg-brand-bright",
  white: "bg-white",
  ink: "bg-ink",
  success: "bg-success",
} as const;

/**
 * The tagline's red dot, alive: a "lub-dub" heartbeat (~1.4s) with a soft ring rippling out on each
 * beat (SPEC §2.1). The same beat marks everything live — the lockup, the ticker's LIVE pill, the
 * dateline clock, fresh stories. Transform/opacity only; static under reduced motion.
 */
export function PulseDot({ size = "sm", pulse = true, tone = "bright", label, className }: PulseDotProps) {
  const color = TONES[tone];
  return (
    <span className={cn("relative inline-flex shrink-0", SIZES[size], className)} aria-hidden={label ? undefined : true}>
      {pulse && (
        <>
          <span className={cn("pulse-ring absolute inset-0 rounded-full", color)} />
          <span className={cn("pulse-ring pulse-ring-dub absolute inset-0 rounded-full", color)} />
        </>
      )}
      <span className={cn("relative inline-block size-full rounded-full", color, pulse && "pulse-beat")} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
