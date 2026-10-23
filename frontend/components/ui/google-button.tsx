"use client";

import { useState, useSyncExternalStore } from "react";
import { markSignedIn, markWelcomeBack } from "@/components/auth/signed-in-flag";
import { googleEnabled, signInWithGoogle, signInWithGoogleInApp } from "@/lib/auth-client";
import { googleWebClientId } from "@/lib/config";
import { hasNativeGoogleSignIn, isNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";
import { SpeedLinesLoader } from "./speed-lines-loader";
import { toast } from "./toast";

export type GoogleButtonProps = {
  /** Where Better Auth sends returning users after Google (same-site path). */
  callbackURL?: string;
  /** Where brand-new Google users land (default /onboarding). */
  newUserCallbackURL?: string;
  label?: string;
  className?: string;
};

const noopSubscribe = () => () => {};

/**
 * Whether to offer "Continue with Google": the backend has it. In the WebNEWS app only with its native account picker
 * (owner 2026-09-29) — Google refuses its web sign-in page inside app web views ("disallowed_useragent"), so an older
 * app build offers email + password only.
 */
export function useGoogleSignIn(): boolean {
  const inApp = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
  const nativeGoogle = useSyncExternalStore(noopSubscribe, hasNativeGoogleSignIn, () => false);
  return googleEnabled && (!inApp || (nativeGoogle && Boolean(googleWebClientId)));
}

/** Google's four-colour "G" (brand guidelines require the official mark). */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={cn("size-4.5 shrink-0", className)}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google". Renders nothing unless NEXT_PUBLIC_GOOGLE_ENABLED=1. On click it
 * navigates to Google's consent screen (redirect URI = FRONTEND_URL/api/auth/callback/google);
 * in the WebNEWS app it opens the phone's Google account picker instead (signInWithGoogleInApp).
 */
export function GoogleButton({ callbackURL = "/", newUserCallbackURL = "/onboarding", label = "Continue with Google", className }: GoogleButtonProps) {
  const [pending, setPending] = useState(false);
  const google = useGoogleSignIn();
  const inApp = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
  if (!google) return null;

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    // The first page after Google's redirect welcomes a Reader (PressPassWelcome).
    markSignedIn();
    markWelcomeBack();
    if (inApp) {
      const { error, cancelled } = await signInWithGoogleInApp({ callbackURL, newUserCallbackURL });
      // On success the page is already loading the next one; only recover when the picker was closed or it failed.
      if (cancelled) setPending(false);
      if (error) {
        setPending(false);
        toast.error("Couldn't sign in with Google", { description: error });
      }
      return;
    }
    const { error } = await signInWithGoogle({ callbackURL, newUserCallbackURL });
    // On success the browser is already navigating away; only recover on failure.
    if (error) {
      setPending(false);
      toast.error("Couldn't reach Google", { description: error });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label === "Google" ? "Continue with Google" : undefined}
      aria-busy={pending || undefined}
      className={cn(
        "relative inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface px-5",
        "text-[0.9375rem] font-bold text-ink transition-[background-color,border-color,transform] duration-150 ease-snap",
        "hover:border-muted-2 hover:bg-surface-2 active:scale-[0.98] motion-reduce:active:scale-100",
        pending && "pointer-events-none opacity-80",
        className,
      )}
    >
      {pending ? <SpeedLinesLoader size="sm" label={inApp ? "Signing in with Google" : "Redirecting to Google"} /> : <GoogleMark />}
      <span>{label}</span>
    </button>
  );
}
