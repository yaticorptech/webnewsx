"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "@/components/ui/modal";
import { PressPassCard, type PressPassCardData } from "./press-pass-card";

export type PressPassZoomProps = {
  data: PressPassCardData;
  open: boolean;
  onClose: () => void;
};

/**
 * The Press Pass full size (owner 2026-10-09: on phones the card is too small to read): over a dimmed screen, as
 * large as the screen allows, always upright (owner 2026-10-09: not turned on its side on phones) — as wide as the
 * screen less a small margin, or as tall as it allows on a landscape screen. A tap anywhere, the × or Escape closes it.
 */
export function PressPassZoom({ data, open, onClose }: PressPassZoomProps) {
  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  // The screen's width less a margin, unless its height (less room for the close button and the hint) is the limit —
  // the card is 0.6 as tall as it is wide.
  const width = "min(calc(100vw - 1.5rem), calc((100dvh - 9rem) / 0.6), 80rem)";
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Your Press Pass, full size" className="fixed inset-0 z-100 flex items-center justify-center">
      <div aria-hidden className="absolute inset-0 bg-ink/92" />
      {/* The whole screen is the close button: a tap on the card or anywhere around it. */}
      <button type="button" autoFocus onClick={onClose} aria-label="Close" className="absolute inset-0 focus-visible:outline-none" />
      <span aria-hidden className="pointer-events-none absolute right-4 top-[calc(var(--safe-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/12 text-white">
        <X className="size-5" />
      </span>
      <div className="pointer-events-none relative" style={{ width }}>
        <PressPassCard data={data} animateIn={false} />
      </div>
      <p aria-hidden className="pointer-events-none absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] text-xs font-semibold text-white/60">
        Tap anywhere to close
      </p>
    </div>,
    document.body,
  );
}
