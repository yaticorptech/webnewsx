"use client";

import { Crown, Lock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useViewer } from "@/components/providers/viewer-provider";
import type { AuthorSummary } from "@/lib/shared/contracts";
import { membershipHref } from "./premium";

/*
 * Members-only stories (owner 2026-10-15): everyone sees their photo and headline; tapping one you can't read yet opens
 * this popup — join the reporter's membership to read it — instead of the story. One popup for the whole site (mounted
 * in app-providers); lib/story-link.ts opens it for every card, tile and reel.
 */

type Ask = { title: string; slug: string; author: AuthorSummary } | null;
let ask: Ask = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function askPremium(story: NonNullable<Ask>): void {
  ask = story;
  emit();
}
const close = () => {
  ask = null;
  emit();
};

export function PremiumGate() {
  const current = useSyncExternalStore(subscribe, () => ask, () => null);
  const viewer = useViewer();
  const next = current ? `/a/${current.slug}` : undefined;
  const join = current
    ? viewer
      ? membershipHref(current.author.username, next)
      : `/login?next=${encodeURIComponent(membershipHref(current.author.username, next))}`
    : "/";
  return (
    <Modal open={current !== null} onOpenChange={(open) => !open && close()} title="Members-only story" hideHeader size="sm">
      {current && (
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <span className="relative">
            <Avatar src={current.author.image} name={current.author.name} size={64} decorative className="ring-2 ring-amber-300" />
            <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-amber-400 text-[#3b2600] ring-2 ring-surface">
              <Lock aria-hidden className="size-3.5" strokeWidth={2.5} />
            </span>
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="kicker flex items-center justify-center gap-1.5 text-amber-700">
              <Crown aria-hidden className="size-3.5" /> Premium
            </p>
            <h2 className="font-wide text-lg font-extrabold leading-snug text-ink">Join {current.author.name}&rsquo;s membership to read this</h2>
            <p className="line-clamp-2 text-sm font-semibold text-ink-2">&ldquo;{current.title}&rdquo;</p>
            <p className="text-sm leading-relaxed text-muted">
              This story is for {current.author.name}&rsquo;s premium members. Become a member to read it and all their members-only stories.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Button href={join} fullWidth leftIcon={<Crown aria-hidden />} onClick={close}>
              {viewer ? "Buy premium" : "Log in to buy premium"}
            </Button>
            <Button variant="ghost" fullWidth onClick={close}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
