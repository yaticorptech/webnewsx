"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { handleText } from "@/components/brand/user-handle";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/*
 * Unfollowing asks first (owner 2026-10-14) — a small centred popup (owner 2026-10-15: back from "slide to unfollow"):
 * "Are you sure you want to unfollow @name?" with No / Yes and a ✕. One popup for the whole site (mounted in
 * app-providers), opened by useFollow's toggle, so every Following button behaves the same.
 */

type Ask = { username: string; onConfirm: () => void } | null;

let ask: Ask = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Opens the popup; `onConfirm` runs only on "Yes". */
export function askUnfollow(username: string, onConfirm: () => void): void {
  ask = { username, onConfirm };
  emit();
}

const close = () => {
  ask = null;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function UnfollowConfirm() {
  const current = useSyncExternalStore(subscribe, () => ask, () => null);
  const question = current ? `Are you sure you want to unfollow ${handleText(current.username)}?` : "Are you sure you want to unfollow?";
  return (
    <Modal
      open={current !== null}
      onOpenChange={(open) => !open && close()}
      variant="dialog"
      hideHeader
      title={question}
      className="max-w-[20rem]"
      bodyClassName="relative px-5 pb-5 pt-6 sm:px-5"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-4.5" />
      </button>
      <p className="px-6 text-center text-base font-semibold leading-snug text-ink">{question}</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={close}>
          No
        </Button>
        <Button
          onClick={() => {
            current?.onConfirm();
            close();
          }}
        >
          Yes
        </Button>
      </div>
    </Modal>
  );
}
