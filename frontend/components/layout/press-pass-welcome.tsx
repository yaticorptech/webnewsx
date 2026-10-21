"use client";

import { BadgeCheck, PenLine } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSignedInMark, hasSignedInMark, takeWelcomeBack } from "@/components/auth/signed-in-flag";
import { showPendingPage } from "@/components/layout/pending-page";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { canPublish } from "@/lib/shared/contracts";

/** Pages that already are the Press Pass ask (the composer asks in its own popup). */
const quietOn = (pathname: string) => pathname === "/press-pass" || pathname.startsWith("/publish");

/**
 * Right after a Reader signs in or finishes signing up (owner 2026-10-08): "Want to publish your first article?" with
 * "Get Press Pass now". Once per sign-in (signed-in-flag.ts); reporters and the Editor Desk just drop the mark.
 */
export function PressPassWelcome() {
  const viewer = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(viewer?.onboarded && viewer.username);
  const reader = signedIn && !canPublish(viewer);
  const quiet = quietOn(pathname);

  // Just logged in: "Welcome back" as an alert card (owner 2026-10-08).
  useEffect(() => {
    if (!signedIn || !takeWelcomeBack()) return;
    const first = viewer?.name?.split(" ")[0] || viewer?.username;
    toast.success(first ? `Welcome back, ${first}` : "Welcome back", { id: "welcome-back", description: "You're logged in to WebNEWS." });
  }, [signedIn, viewer?.name, viewer?.username]);

  useEffect(() => {
    if (!signedIn || !hasSignedInMark()) return;
    if (!reader || quiet) {
      clearSignedInMark();
      return;
    }
    // A moment after the page shows; the mark is taken only when the popup actually opens.
    const timer = setTimeout(() => {
      clearSignedInMark();
      setOpen(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [signedIn, reader, quiet]);

  return (
    <Modal
      open={open && reader}
      onOpenChange={setOpen}
      title="Want to publish your first article?"
      description="Get your Press Pass and start filing news on WebNEWS. It takes a minute."
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
              showPendingPage("/press-pass");
              router.push("/press-pass");
            }}
            leftIcon={<BadgeCheck aria-hidden />}
          >
            Get Press Pass now
          </Button>
        </>
      }
    >
      <div className="panel-tint flex items-center gap-4 px-5 py-5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-pop">
          <PenLine aria-hidden className="size-5.5" />
        </span>
        <p className="text-sm leading-relaxed text-ink-2">
          Report what&apos;s happening around you — your stories reach readers across WebNEWS the moment they&apos;re live.
        </p>
      </div>
    </Modal>
  );
}
