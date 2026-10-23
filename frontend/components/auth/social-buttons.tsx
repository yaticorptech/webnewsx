"use client";

import { useState } from "react";
import { FacebookIcon, LinkedInIcon, XIcon } from "@/components/feed/share-glyphs";
import { GoogleButton, useGoogleSignIn } from "@/components/ui/google-button";
import { toast } from "@/components/ui/toast";
import { signInWithSocial, type SocialProvider } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { withNext } from "./next-path";
import { markSignedIn, markWelcomeBack } from "./signed-in-flag";

/*
 * The social logins on Log in and Create account (owner 2026-10-22: "multiple social media accounts"): Google, then
 * Facebook, LinkedIn and X — always shown (owner: "where are the other social media accounts"; Apple dropped 2026-10-23, it's paid); one the backend has
 * no keys for yet answers "isn't set up yet" when tapped. One look for all of them (the Google button's), each with its
 * own real mark. Google alone keeps its native picker in the app (google-button.tsx).
 */

const BUTTON = cn(
  "relative inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface px-5",
  "text-[0.9375rem] font-bold text-ink transition-[background-color,border-color,transform] duration-150 ease-snap",
  "hover:border-muted-2 hover:bg-surface-2 active:scale-[0.98] motion-reduce:active:scale-100",
);

export function SocialButtons({ next, className }: { next: string | null; className?: string }) {
  const google = useGoogleSignIn();
  const callbackURL = next ?? "/";
  const newUserCallbackURL = withNext("/onboarding", next);
  return (
    // Two by two (owner 2026-10-23): just the name on each button; screen readers hear "Continue with …".
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {google && <GoogleButton callbackURL={callbackURL} newUserCallbackURL={newUserCallbackURL} label="Google" />}
      <SocialButton provider="facebook" label="Facebook" icon={<FacebookIcon size={20} />} callbackURL={callbackURL} newUserCallbackURL={newUserCallbackURL} />
      <SocialButton provider="linkedin" label="LinkedIn" icon={<LinkedInIcon size={20} />} callbackURL={callbackURL} newUserCallbackURL={newUserCallbackURL} />
      <SocialButton provider="twitter" label="X" icon={<XIcon size={20} />} callbackURL={callbackURL} newUserCallbackURL={newUserCallbackURL} />
    </div>
  );
}

/** Whether any social login is on offer (the pages put a divider between them and the phone form) — always, now. */
export function useSocialLogins(): boolean {
  return true;
}

function SocialButton({
  provider,
  label,
  icon,
  callbackURL,
  newUserCallbackURL,
}: {
  provider: Exclude<SocialProvider, "google">;
  label: string;
  icon: React.ReactNode;
  callbackURL: string;
  newUserCallbackURL: string;
}) {
  const [pending, setPending] = useState(false);
  const onClick = async () => {
    if (pending) return;
    setPending(true);
    // The first page after the provider's redirect welcomes a Reader (PressPassWelcome).
    markSignedIn();
    markWelcomeBack();
    const { error } = await signInWithSocial(provider, { callbackURL, newUserCallbackURL });
    // On success the browser is already navigating away; only recover on failure.
    if (error) {
      setPending(false);
      // No keys for this provider on the backend yet (Better Auth: "Provider not found").
      const notReady = /provider not found|not configured/i.test(error);
      toast.error(notReady ? `${label} sign-in isn't set up yet` : `Couldn't start ${label} sign-in`, {
        description: notReady ? "Use your WhatsApp number or Google for now." : error,
      });
    }
  };
  return (
    <button type="button" onClick={onClick} aria-label={`Continue with ${label}`} aria-busy={pending || undefined} className={cn(BUTTON, pending && "pointer-events-none opacity-80")}>
      <span className="inline-flex size-5 shrink-0 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}
