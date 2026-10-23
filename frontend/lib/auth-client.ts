import { phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { googleEnabled, googleWebClientId } from "./config";
import { nativeGoogleIdToken } from "./native-app";
import { forgetPushDevice } from "./native-push";

/**
 * Better Auth React client. Same-origin: requests go to `/api/auth/*` on this site and the
 * Next.js rewrite forwards them to the backend, so the session cookie is first-party.
 * (No baseURL → the client uses the current window origin.)
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  // Phone sign-in (owner 2026-10-23): number + password once the number is verified on WhatsApp (phone-auth-form.tsx).
  plugins: [phoneNumberClient()],
});

/** Logs in with a WhatsApp-verified number (E.164) and its password. */
export const signInWithPhonePassword = (phoneNumber: string, password: string) =>
  authClient.signIn.phoneNumber({ phoneNumber, password, rememberMe: true });

/** The social logins (owner 2026-10-22): Google as before, plus Facebook, LinkedIn and X when their keys are set. */
export type SocialProvider = "google" | "facebook" | "linkedin" | "twitter";

/**
 * "Continue with Facebook / LinkedIn / X": the backend's consent URL, then that provider's page; it comes back to
 * `${FRONTEND_URL}/api/auth/callback/<provider>` and Better Auth sends the person to `callbackURL` (new accounts to
 * `newUserCallbackURL`). Resolves with an error message when the request fails (the page stays put).
 */
export async function signInWithSocial(
  provider: SocialProvider,
  { callbackURL = "/", newUserCallbackURL = "/onboarding", errorCallbackURL = "/login" }: { callbackURL?: string; newUserCallbackURL?: string; errorCallbackURL?: string } = {},
): Promise<{ error: string | null }> {
  const { error } = await signIn.social({ provider, callbackURL, newUserCallbackURL, errorCallbackURL });
  return { error: error ? error.message || "Couldn't start the sign-in. Please try again." : null };
}

export const { signIn, signUp, useSession } = authClient;

/** Logs out — in the app, this phone first stops getting the account's push notifications (lib/native-push.ts). */
export const signOut: typeof authClient.signOut = async (...args) => {
  await forgetPushDevice();
  return authClient.signOut(...args);
};

export { googleEnabled };

/**
 * "Continue with Google": asks the backend for the Google consent URL and navigates there.
 * Google redirects back to `${FRONTEND_URL}/api/auth/callback/google`, then Better Auth sends the
 * user to `callbackURL` (new users to `newUserCallbackURL`, default /onboarding).
 * Resolves with an error message when the request fails (the page stays put).
 */
export async function signInWithGoogle({
  callbackURL = "/",
  newUserCallbackURL = "/onboarding",
  errorCallbackURL = "/login",
}: { callbackURL?: string; newUserCallbackURL?: string; errorCallbackURL?: string } = {}): Promise<{ error: string | null }> {
  if (!googleEnabled) return { error: "Google sign-in is not enabled." };
  // A refused Google sign-in (e.g. an Editor Desk account: email + password only) comes back to /login?error=CODE.
  const { error } = await signIn.social({ provider: "google", callbackURL, newUserCallbackURL, errorCallbackURL });
  return { error: error ? error.message || "Couldn't start Google sign-in. Please try again." : null };
}

/**
 * "Continue with Google" in the WebNEWS app (owner 2026-09-29): Google refuses its sign-in page inside app web views,
 * so the phone's own account picker hands over an ID token and the backend verifies it (Better Auth
 * `signIn.social({ idToken })`: same account rules as the web flow — suspended and Editor Desk accounts are refused).
 * Then a full page load to `callbackURL`, or `newUserCallbackURL` for an account that hasn't onboarded yet.
 * `cancelled`: the person closed the picker (nothing to report).
 */
export async function signInWithGoogleInApp({
  callbackURL = "/",
  newUserCallbackURL = "/onboarding",
}: { callbackURL?: string; newUserCallbackURL?: string } = {}): Promise<{ error: string | null; cancelled?: boolean }> {
  if (!googleEnabled || !googleWebClientId) return { error: "Google sign-in is not enabled." };
  let idToken: string | null;
  try {
    idToken = await nativeGoogleIdToken(googleWebClientId);
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : "Couldn't open Google sign-in. Please try again." };
  }
  if (!idToken) return { error: null, cancelled: true };
  const { data, error } = await signIn.social({ provider: "google", idToken: { token: idToken } });
  if (error) return { error: error.message || "Couldn't sign in with Google. Please try again." };
  const user = (data as { user?: { onboardedAt?: unknown } } | null)?.user;
  window.location.assign(user?.onboardedAt ? callbackURL : newUserCallbackURL);
  return { error: null };
}
