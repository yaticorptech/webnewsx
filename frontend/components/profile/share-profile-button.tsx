"use client";

import { Download, Link2, QrCode, Share2 } from "lucide-react";
import { useState } from "react";
import { ExternalShareButton, SendSheet } from "@/components/messages/send-sheet";
import { useCanMessage } from "@/components/messages/use-can-message";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/feed/share-glyphs";
import { downloadProfileQr, shareProfileQr, shareProfileQrTo, type QrApp } from "./profile-qr";

export type ShareProfileButtonProps = {
  username: string;
  name: string;
  /** Their photo, for the Send sheet's clipping. */
  image?: string | null;
  /** Visible label "Share" at every width (the accessible name stays "Share profile"). */
  compact?: boolean;
  /** "Share" on phones, just the icon from 640px (the accessible name stays "Share profile"). */
  iconOnly?: boolean;
  className?: string;
};

/**
 * Share the profile. Signed in (owner 2026-09-30): the "Send to" sheet — send it to people and chats in WebNEWS, with
 * Copy link and the native sheet (touch devices; else copy with a toast) underneath. Logged out (owner 2026-09-30):
 * the log-in prompt, like Like. Uses the live origin so shared links always match the address in the browser.
 */
/** App icons under "Outside WebNEWS" (owner 2026-10-14): each shares the profile's QR card. */
/** Each app's own icon (share-glyphs.tsx) is the tile (owner 2026-10-22: "everywhere the real icons only"). */
const APPS: { app: QrApp; label: string; icon: React.ReactNode }[] = [
  { app: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon size={40} /> },
  { app: "instagram", label: "Instagram", icon: <InstagramIcon size={40} /> },
  { app: "facebook", label: "Facebook", icon: <FacebookIcon size={40} /> },
];

export function ShareProfileButton({ username, name, image = null, compact = false, iconOnly = false, className }: ShareProfileButtonProps) {
  const canMessage = useCanMessage();
  const authPrompt = useAuthPrompt();
  const [sheetOpen, setSheetOpen] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied", { description: url.replace(/^https?:\/\//, ""), id: "share-profile" });
    } catch {
      toast.error("Couldn't copy the link", { description: url, id: "share-profile" });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={canMessage ? () => setSheetOpen(true) : () => authPrompt.open("Log in to share profiles")}
        title="Share profile"
        leftIcon={<Share2 aria-hidden />}
        className={className}
      >
        <span className={iconOnly ? "sm:sr-only" : undefined}>
          Share<span className={compact || iconOnly ? "sr-only" : "max-sm:sr-only"}> profile</span>
        </span>
      </Button>
      {canMessage && (
        <SendSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          item={{ kind: "profile", username, name, image }}
          external={
            // Outside WebNEWS (owner 2026-10-14): the profile's QR card is what gets shared.
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
              {APPS.map(({ app, label, icon }) => (
                <button
                  key={app}
                  type="button"
                  aria-label={`Share QR on ${label}`}
                  title={`Share QR on ${label}`}
                  onClick={() => {
                    setSheetOpen(false);
                    void shareProfileQrTo(app, name, username, image);
                  }}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 [&_svg]:drop-shadow-sm"
                >
                  {icon}
                </button>
              ))}
              <ExternalShareButton
                label="Share QR"
                icon={<QrCode aria-hidden />}
                onClick={() => {
                  setSheetOpen(false);
                  void shareProfileQr(name, username, image);
                }}
              />
              <ExternalShareButton label="Download QR" icon={<Download aria-hidden />} onClick={() => void downloadProfileQr(name, username, image)} />
              <ExternalShareButton label="Copy link" icon={<Link2 aria-hidden />} onClick={() => void copy()} />
            </div>
          }
        />
      )}
    </>
  );
}
