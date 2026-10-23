"use client";

import { BadgeCheck, PenLine } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { showPendingPage } from "@/components/layout/pending-page";
import { useViewer } from "@/components/providers/viewer-provider";
import { isTourActive } from "@/components/tour/guided-tour";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { canPublish } from "@/lib/shared/contracts";

/** A while after a page opens, and at most once a day per account on this device. */
const AFTER_MS = 20_000;
const EVERY_MS = 24 * 60 * 60_000;
const SHOWN_KEY = "webnews:first-steps";
/** Shown (by this or the sign-in welcome, press-pass-welcome.tsx) in this tab's session: not twice in one visit. */
export const FIRST_STEPS_SESSION_KEY = "webnews:first-steps-session";

/** The Press Pass page and the composer are the very places it points to. */
const quietOn = (pathname: string) => pathname === "/press-pass" || pathname.startsWith("/publish") || pathname.startsWith("/settings");

function lastShown(id: string): number {
  try {
    return Number((JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "{}") as Record<string, number>)[id]) || 0;
  } catch {
    return 0;
  }
}

function markShown(id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "{}") as Record<string, number>;
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ ...all, [id]: Date.now() }));
    sessionStorage.setItem(FIRST_STEPS_SESSION_KEY, "1");
  } catch {
    // Not remembered: it may come back on the next visit.
  }
}

function shownThisSession(): boolean {
  try {
    return sessionStorage.getItem(FIRST_STEPS_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * New accounts' next step (owner 2026-10-23: "for new users show popup — post your first article, and the Press Pass"):
 * a Reader is asked to get a Press Pass; a reporter with no story live yet to post the first one. Once a day, a little
 * after the page opens — never over the guided tour or another popup, never for the Editor Desk or a group's writers.
 */
export function FirstStepsPopup() {
  const viewer = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(viewer?.onboarded && viewer.username) && viewer?.role !== "admin";
  const reporter = canPublish(viewer);
  const kind: "press-pass" | "first-story" | null = !signedIn
    ? null
    : !reporter
      ? "press-pass"
      : (viewer?.publishedStories ?? 1) === 0 && viewer?.actingAs?.role !== "writer"
        ? "first-story"
        : null;
  const quiet = quietOn(pathname);
  const id = viewer?.id ?? "";

  useEffect(() => {
    if (!kind || quiet || open || shownThisSession() || Date.now() - lastShown(id) < EVERY_MS) return;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      if (Date.now() - startedAt < AFTER_MS || document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]') || isTourActive()) return;
      clearInterval(tick);
      markShown(id);
      setOpen(true);
    }, 1000);
    return () => clearInterval(tick);
  }, [kind, quiet, open, id]);

  if (!kind) return null;
  const firstStory = kind === "first-story";
  const href = firstStory ? "/publish" : "/press-pass";
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={firstStory ? "Post your first article" : "Get your Press Pass"}
      description={
        firstStory
          ? "Your Press Pass is ready — file your first story and it reaches readers across WebNEWS."
          : "Want to publish too? Your Press Pass takes a minute, and then you can file news on WebNEWS."
      }
      size="sm"
      variant="dialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              showPendingPage(href);
              router.push(href);
            }}
            leftIcon={firstStory ? <PenLine aria-hidden /> : <BadgeCheck aria-hidden />}
          >
            {firstStory ? "Write my first story" : "Get Press Pass"}
          </Button>
        </>
      }
    >
      <div className="panel-tint flex items-center gap-4 px-5 py-5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-pop">
          {firstStory ? <PenLine aria-hidden className="size-5.5" /> : <BadgeCheck aria-hidden className="size-5.5" />}
        </span>
        <p className="text-sm leading-relaxed text-ink-2">
          {firstStory
            ? "Add a photo, a headline and a few lines — the composer walks you through it in three steps."
            : "Report what's happening around you — your stories reach readers the moment they're live."}
        </p>
      </div>
    </Modal>
  );
}
