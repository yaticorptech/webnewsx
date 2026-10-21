import { TRAINEE_APPROVALS_TO_VERIFY } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * A Trainee's road to Verified: one slanted bar (the icon's speed lines) per required approval,
 * filled red as stories get approved.
 */
export function ApprovalsMeter({ approved, className }: { approved: number; className?: string }) {
  const total = TRAINEE_APPROVALS_TO_VERIFY;
  const done = Math.min(Math.max(approved, 0), total);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="flex gap-0.75">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn("slant h-2 w-4.5 [--slant-x:0.25rem]", i < done ? "bg-brand" : "bg-border-strong/70")}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-xs font-semibold text-muted tabular-nums">
        {done} of {total} approved
      </span>
    </span>
  );
}
