"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { isTourActive } from "@/components/tour/guided-tour";
import { toast } from "@/components/ui/toast";
import { canPublish } from "@/lib/shared/contracts";

/** One popup every 10 minutes (owner 2026-10-08; it was once a minute); the first half a minute after the page opens. */
const EVERY_MS = 10 * 60_000;
const FIRST_MS = 30_000;
const LAST_SHOWN_KEY = "webnews:press-pass-nudge";

/** The Press Pass page itself, and the composer (it asks in its own popup). */
const quietOn = (pathname: string) => pathname === "/press-pass" || pathname.startsWith("/publish");

function readLastShown(): number {
  try {
    return Number(localStorage.getItem(LAST_SHOWN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastShown(at: number) {
  try {
    localStorage.setItem(LAST_SHOWN_KEY, String(at));
  } catch {
    // Private mode / blocked storage: the minute is then counted from this page load only.
  }
}

/**
 * Readers don't know they can publish too (owner 2026-10-08): every 10 minutes a popup asks "Want to publish a story?" and
 * opens the Press Pass page. Stops the moment they hold a Press Pass. The last time shown is kept on the device, so a
 * reload doesn't bring it back early; never while the tab is hidden or a dialog is open.
 */
export function PressPassNudge() {
  const viewer = useViewer();
  const pathname = usePathname();
  const reader = Boolean(viewer?.onboarded && viewer.username && !canPublish(viewer));
  const quiet = quietOn(pathname);

  useEffect(() => {
    if (!reader || quiet) return;
    let next = Math.max(Date.now() + FIRST_MS, readLastShown() + EVERY_MS);
    const tick = setInterval(() => {
      if (Date.now() < next || document.hidden || document.querySelector("[role=dialog]") || isTourActive()) return;
      toast("Want to publish a story?", {
        id: "press-pass-nudge",
        description: "Create your Press Pass and file news on WebNEWS.",
        action: { label: "Click here", href: "/press-pass" },
        duration: 10_000,
      });
      const now = Date.now();
      writeLastShown(now);
      next = now + EVERY_MS;
    }, 1000);
    return () => clearInterval(tick);
  }, [reader, quiet]);

  return null;
}
