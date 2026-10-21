"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { goBack } from "@/lib/nav-history";

/**
 * Unsaved-changes guard. The App Router has no navigation-blocking API, so while `dirty`:
 *  - `beforeunload` covers reloads, tab closes and external links;
 *  - a capture-phase click listener on `window` (it runs before Next's <Link> handler) holds same-origin
 *    link clicks — and the site's ← back arrow (`[data-back-button]`) — and asks first.
 * (The browser's own Back button isn't intercepted; the localStorage autosave keeps the work either way.)
 */

/** `pendingHref` value for "the back arrow was pressed" (followed by its fallback page). */
const BACK = "back:";
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      const back = target?.closest<HTMLElement>("[data-back-button]");
      if (back) {
        event.preventDefault();
        event.stopPropagation();
        setPendingHref(`${BACK}${back.dataset.backFallback ?? "/"}`);
        return;
      }
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.closest("[data-composer-preview]")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // full page load → beforeunload asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return {
    pendingHref,
    cancel: () => setPendingHref(null),
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href?.startsWith(BACK)) goBack(router, href.slice(BACK.length));
      else if (href) router.push(href);
    },
  };
}

export type LeaveDialogProps = {
  open: boolean;
  canSave: boolean;
  saving: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
};

export function LeaveDialog({ open, canSave, saving, onStay, onLeave, onSaveAndLeave }: LeaveDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onStay()}
      title="Leave this story?"
      description="Your latest changes aren't in your drafts yet. A copy stays on this device, but it won't follow you anywhere else."
      size="sm"
      bodyClassName="py-1"
      // Three actions don't fit side by side in a small dialog: stack them, primary first.
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button onClick={onStay} disabled={saving} fullWidth>
            Keep writing
          </Button>
          {canSave && (
            <Button variant="outline" onClick={onSaveAndLeave} loading={saving} fullWidth>
              Save draft &amp; leave
            </Button>
          )}
          <Button variant="ghost" onClick={onLeave} disabled={saving} fullWidth>
            Leave anyway
          </Button>
        </div>
      }
    />
  );
}
