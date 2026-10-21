import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import type { PageSearchParams } from "@/components/auth/next-path";
import { ExpiredLink, ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your WebNEWS account.",
  robots: { index: false },
};

/**
 * Step 2 of a password reset (owner 2026-09-29). The email's link goes through the API
 * (/api/auth/reset-password/:token), which sends a valid link here with `?token=` and a used or expired one with
 * `?error=INVALID_TOKEN`. No logged-in redirect: the link must work from any browser.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: PageSearchParams }) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;

  return (
    <AuthShell
      panel={{
        kicker: "Account help",
        title: (
          <>
            A fresh
            <br />
            start.
          </>
        ),
        lede: "Pick a strong password you don't use anywhere else. Every device signed in to your account is signed out.",
      }}
    >
      <AuthHeading
        kicker="New password"
        title={valid ? "Choose a new password" : "Link expired"}
        lede={valid ? "Use at least 8 characters. After saving, log in with your new password." : undefined}
      />
      <div className="mt-8">{valid ? <ResetPasswordForm token={token} /> : <ExpiredLink />}</div>
    </AuthShell>
  );
}
