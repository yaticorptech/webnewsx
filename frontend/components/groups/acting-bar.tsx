"use client";

import { ArrowLeftRight } from "lucide-react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { GROUP_ROLE_LABELS } from "@/lib/shared/contracts";
import { useSwitchAccount } from "./use-switch-account";

/**
 * While posting as a group account (owner 2026-10-23), every page says so on top — so nobody likes, comments or
 * publishes as "VK Mangalore" by mistake — with a one-tap way back to their own account.
 */
export function ActingBar() {
  const viewer = useViewer();
  const { switchTo, pending } = useSwitchAccount();
  const acting = viewer?.actingAs;
  if (!viewer || !acting) return null;
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-3 rounded-2xl border border-tint-border bg-tint px-3 py-2 text-sm text-ink"
    >
      <Avatar src={viewer.image} name={viewer.name} size="xs" decorative />
      <p className="min-w-0 flex-1 truncate">
        Posting as <span className="font-bold">{viewer.name}</span>
        <span className="text-muted"> · {GROUP_ROLE_LABELS[acting.role]}</span>
      </p>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => void switchTo(null)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-brand transition-colors hover:bg-tint-2 disabled:opacity-60"
      >
        <ArrowLeftRight aria-hidden className="size-3.5" />
        Switch to {acting.member.name || "you"}
      </button>
    </div>
  );
}
