import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Avatar } from "@/components/ui/avatar";
import { REPORTER_LEVEL_LABELS, type PressPassSummary, type ViewerUser } from "@/lib/shared/contracts";

/**
 * Mini Press Pass card closing the Newsroom: issuer strip, portrait, pass number and level, linking
 * to the full animated pass at /press-pass.
 */
export function PressPassLink({ pass, viewer }: { pass: PressPassSummary | null; viewer: Pick<ViewerUser, "name" | "username" | "image"> }) {
  return (
    <Link
      href="/press-pass"
      aria-label={pass ? `Your Press Pass ${pass.passNumber} — view it` : "Get your Press Pass"}
      className="group card relative isolate block overflow-hidden transition-[box-shadow,transform,border-color] duration-300 ease-snap hover:-translate-y-0.5 hover:border-tint-border hover:shadow-pop motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center justify-between gap-3 border-b border-tint-border bg-tint px-5 py-2.5">
        <span className="kicker flex items-center gap-2 text-brand">
          <SpeedBarsSvg className="h-2.5 w-auto text-brand" />
          WebNEWS Press Pass
        </span>
        {pass && (
          <span className="kicker text-muted">{pass.status === "active" ? "Active" : "Revoked"}</span>
        )}
      </div>
      <div className="flex items-center gap-4 px-5 py-4">
        <Avatar src={viewer.image} name={viewer.name} size={52} decorative className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-wide text-base font-extrabold text-ink">
            <span className="truncate">{viewer.name}</span>
            {pass?.level === "verified" && <VerifiedBadge size={18} />}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-muted">
            {pass ? (
              <>
                <span className="font-mono tracking-wide text-ink-2">{pass.passNumber}</span> · {REPORTER_LEVEL_LABELS[pass.level]}
                {!pass.complete && <span className="text-brand"> · incomplete</span>}
              </>
            ) : (
              "Editor Desk — no Press Pass needed"
            )}
          </p>
        </div>
        <ArrowRight aria-hidden className="size-5 shrink-0 text-brand transition-transform duration-200 ease-snap group-hover:translate-x-1" />
      </div>
      <SpeedBarsSvg className="pointer-events-none absolute -bottom-6 right-10 -z-10 w-28 text-brand opacity-[0.05]" />
    </Link>
  );
}
