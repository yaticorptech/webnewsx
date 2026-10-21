"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

/** The server's guess from the user agent: a phone browser or the WebNEWS app (app/layout.tsx). */
const PhoneHintContext = createContext(false);

export function PhoneHintProvider({ phone, children }: { phone: boolean; children: ReactNode }) {
  return <PhoneHintContext.Provider value={phone}>{children}</PhoneHintContext.Provider>;
}

/**
 * True on phone-width screens (< 640px, Tailwind `sm`). Server rendering and hydration use the user-agent guess, so a
 * phone gets its own layout from the first paint (no flash of the desktop one); then the live screen width.
 */
export function usePhoneLayout(): boolean {
  return useMediaQuery("(max-width: 639.98px)", useContext(PhoneHintContext));
}
