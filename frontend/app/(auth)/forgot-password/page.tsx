import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { redirectIfLoggedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to choose a new WebNEWS password.",
  robots: { index: false },
};

/** Step 1 of a password reset (owner 2026-09-29): the email the link goes to. Step 2 is /reset-password. */
export default async function ForgotPasswordPage() {
  await redirectIfLoggedIn("/");

  return (
    <AuthShell
      panel={{
        kicker: "Account help",
        title: (
          <>
            Back on the
            <br />
            wire in a minute.
          </>
        ),
        lede: "We'll email you a one-time link. Choose a new password and pick up right where you left off.",
      }}
    >
      <AuthHeading
        kicker="Forgot password"
        title="Reset your password"
        lede="Enter the email you use for WebNEWS and we'll send you a link to choose a new password."
      />
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
