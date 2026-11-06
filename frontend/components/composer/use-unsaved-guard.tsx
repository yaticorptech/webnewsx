"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { goBack } from "@/lib/nav-history";

/**
 * Unsaved-changes guard. The App Router has no navigation-blocking API, so while `dirty`:
 *  - `beforeunload` covers reloads, tab closes and external links;
 *  - a capture-phase click listener on `window` (it runs before Next's <Link> handler) holds same-origin
 *    link clicks — and the site's ← back arrow (`[data-back-button]`) — and asks first;
 *  - the browser's / phone's Back (owner 2026-11-06: "when click on back it direct goes"): a copy of this page's
 *    history entry sits on top; Back lands on the page itself, the copy goes back on, and the dialog asks.
 */

/** `pendingHref` value for "the back arrow was pressed" (followed by its fallback page). */
const BACK = "back:";
/** `pendingHref` value for "the browser's / phone's Back was pressed". */
const HISTORY_BACK = "history-back";
const TRAP_KEY = "__composerGuard";
/** Our own Back (dropping the copy) is on its way: its popstate isn't the user's. */
let selfBack = false;
const trapped = () => Boolean((window.history.state as Record<string, unknown> | null)?.[TRAP_KEY]);
const pushTrap = () => {
  try {
    window.history.pushState({ ...(window.history.state ?? {}), [TRAP_KEY]: true }, "");
  } catch {
    // Some embedded browsers refuse pushState: Back then simply leaves (the autosave keeps the work).
  }
};
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
    const onPopState = () => {
      if (trapped()) return; // Forward onto the copy
      pushTrap();
      if (selfBack) {
        selfBack = false; // still guarding (e.g. effects re-run in development): just put the copy back
        return;
      }
      setPendingHref(HISTORY_BACK);
    };
    if (!trapped()) pushTrap();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      // Nothing to guard any more (saved, published) but still on the copy: drop it, so one Back leaves the page.
      if (trapped()) {
        selfBack = true;
        window.history.back();
      }
    };
  }, [dirty]);

  return {
    pendingHref,
    cancel: () => setPendingHref(null),
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      // Back past the copy and the page itself, to wherever Back was going.
      if (href === HISTORY_BACK) window.history.go(trapped() ? -2 : -1);
      else if (href?.startsWith(BACK)) goBack(router, href.slice(BACK.length));
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
  /** "Schedule" (owner 2026-11-06): opens the composer's schedule picker instead of leaving. */
  onSchedule?: () => void;
  /** Nothing unsaved (the preview asks anyway, owner 2026-11-06): it's already in Drafts. */
  saved?: boolean;
};

export function LeaveDialog({ open, canSave, saving, onStay, onLeave, onSaveAndLeave, onSchedule, saved = false }: LeaveDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onStay()}
      title="Leave this story?"
      description={
        saved
          ? "It's saved in your Drafts, but not published yet. Publish it, schedule it for later, or come back to it any time."
          : "Your latest changes aren't in your drafts yet. A copy stays on this device, but it won't follow you anywhere else."
      }
      size="sm"
      bodyClassName="py-1"
      // Three actions don't fit side by side in a small dialog: stack them, primary first.
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button onClick={onStay} disabled={saving} fullWidth>
            Keep writing
          </Button>
          {onSchedule && (
            <Button variant="outline" onClick={onSchedule} disabled={saving} leftIcon={<CalendarClock aria-hidden />} fullWidth>
              Schedule
            </Button>
          )}
          {canSave && !saved && (
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
