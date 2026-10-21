import { Clock3, EyeOff, FileText, Pin, Sparkles, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { PulseDot } from "@/components/ui/pulse-dot";
import {
  FLAG_REASON_LABELS,
  ROLE_LABELS,
  type FlagReason,
  type ReporterLevel,
  type Role,
  type SpotlightStatus,
  type StoryStatus,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

type Tone = "live" | "brand" | "soft" | "neutral" | "muted" | "solid";

const TONES: Record<Tone, string> = {
  /** Green: live / active / granted. */
  live: "bg-success-soft text-success-strong",
  /** Red text on pink: needs the desk. */
  brand: "bg-tint text-brand-strong ring-1 ring-inset ring-tint-border",
  soft: "bg-tint text-brand-strong",
  neutral: "bg-surface-2 text-ink-2 ring-1 ring-inset ring-border",
  muted: "bg-surface-2 text-muted",
  /** Filled red (Spotlight, suspended). */
  solid: "bg-brand text-brand-contrast",
};

export function Chip({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[0.6875rem] font-bold tracking-[0.02em] [&_svg]:size-3",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const STORY_STATUS: Record<StoryStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  published: { label: "Live", tone: "live", icon: <PulseDot size="xs" tone="success" pulse={false} /> },
  hidden: { label: "Hidden", tone: "neutral", icon: <EyeOff aria-hidden /> },
  in_review: { label: "In review", tone: "brand", icon: <Clock3 aria-hidden /> },
  returned: { label: "Returned", tone: "soft", icon: <Undo2 aria-hidden /> },
  draft: { label: "Draft", tone: "muted", icon: <FileText aria-hidden /> },
};

export function StoryStatusChip({ status, className }: { status: StoryStatus; className?: string }) {
  const meta = STORY_STATUS[status];
  return (
    <Chip tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Chip>
  );
}

export function EditorsPickChip({ order }: { order?: number | null }) {
  return (
    <Chip tone="soft" icon={<Pin aria-hidden />}>
      Editor&apos;s Pick{order ? ` #${order}` : ""}
    </Chip>
  );
}

export function SpotlightChip({ label = "Spotlight" }: { label?: string }) {
  return (
    <Chip tone="solid" icon={<Sparkles aria-hidden />}>
      {label}
    </Chip>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return <Chip tone={role === "admin" ? "solid" : role === "reporter" ? "brand" : "muted"}>{ROLE_LABELS[role]}</Chip>;
}

/** Verified → the animated badge + label; Trainee → grey chip (SPEC §3.11); Revoked → muted chip. */
export function LevelChip({ level, revoked = false }: { level: ReporterLevel | null; revoked?: boolean }) {
  if (revoked) return <Chip tone="muted">Revoked</Chip>;
  if (level === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
        <VerifiedBadge size={16} tooltip={false} label="" />
        Verified
      </span>
    );
  }
  if (level === "trainee") return <Chip tone="neutral">Trainee</Chip>;
  return null;
}

export function FlagReasonChip({ reason, count }: { reason: FlagReason; count?: number }) {
  return (
    <Chip tone="brand">
      {FLAG_REASON_LABELS[reason]}
      {count !== undefined && count > 1 && <span className="tabular-nums opacity-80">×{count}</span>}
    </Chip>
  );
}

const SPOTLIGHT_STATUS: Record<SpotlightStatus, { label: string; tone: Tone }> = {
  pending: { label: "Awaiting desk", tone: "brand" },
  granted: { label: "Granted", tone: "live" },
  declined: { label: "Declined", tone: "muted" },
  expired: { label: "Ended", tone: "neutral" },
  cancelled: { label: "Withdrawn", tone: "muted" },
};

export function SpotlightStatusChip({ status, active }: { status: SpotlightStatus; active: boolean }) {
  if (active) {
    return (
      <Chip tone="solid" icon={<PulseDot size="xs" tone="white" />}>
        Running
      </Chip>
    );
  }
  const meta = SPOTLIGHT_STATUS[status];
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}
