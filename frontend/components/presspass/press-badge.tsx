import { GraduationCap, Newspaper } from "lucide-react";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import type { ReporterLevel, Role } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase leading-none tracking-[0.12em] [&_svg]:size-3";

/** Small grey "Trainee" chip — Trainees carry no Verified badge (SPEC §3.11). */
export function TraineeChip({ className }: { className?: string }) {
  return (
    <span className={cn(CHIP, "border border-border-strong bg-surface-2 text-muted", className)}>
      <GraduationCap aria-hidden />
      Trainee
    </span>
  );
}

/** Crimson-outlined "Reporter" chip on a Verified reporter's profile. */
export function ReporterChip({ className }: { className?: string }) {
  return <span className={cn(CHIP, "border border-tint-border bg-tint px-2.5 py-1 text-brand", className)}>Reporter</span>;
}

/** Crimson-outlined "Editor Desk" chip for admins. */
export function EditorDeskChip({ className }: { className?: string }) {
  return (
    <span className={cn(CHIP, "border border-tint-border bg-tint text-brand", className)}>
      <Newspaper aria-hidden />
      Editor Desk
    </span>
  );
}

export type PressBadgeProps = {
  role: Role | undefined;
  level: ReporterLevel | null | undefined;
  /** Verified badge size in px. */
  size?: number;
  className?: string;
};

/**
 * The press badge beside a reporter's name: the animated Verified badge for Verified reporters and the
 * Editor Desk (plus an "Editor Desk" chip for admins), a grey "Trainee" chip for Trainees, nothing for Readers.
 */
export function PressBadge({ role, level, size = 20, className }: PressBadgeProps) {
  if (role === "admin") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <VerifiedBadge size={size} label="Verified — Editor Desk" />
        <EditorDeskChip />
      </span>
    );
  }
  if (role !== "reporter" || !level) return null;
  if (level === "verified") return <VerifiedBadge size={size} className={className} label="Verified reporter" />;
  return <TraineeChip className={className} />;
}
