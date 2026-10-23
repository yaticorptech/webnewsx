import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { googleReturnError } from "@/components/auth/auth-errors";
import { AuthOptions } from "@/components/auth/auth-options";
import { LoginForm } from "@/components/auth/login-form";
import { readNextParam, type PageSearchParams } from "@/components/auth/next-path";
import { redirectIfLoggedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to WebNEWS to publish stories, follow publishers and like what matters.",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: { searchParams: PageSearchParams }) {
  const next = await readNextParam(searchParams);
  await redirectIfLoggedIn(next ?? "/");
  const { error, reset, desk } = await searchParams;
  // Email + password is the Editor Desk's only (owner 2026-10-22); readers use their WhatsApp number or a social account.
  const deskMode = desk === "1";

  return (
    <AuthShell
      panel={{
        kicker: "Live on WebNEWS",
        title: (
          <>
            The wire
            <br />
            never sleeps.
          </>
        ),
        lede: "Pick up where you left off: the stories you follow, the publishers you trust, and your own drafts.",
      }}
    >
      {deskMode ? (
        <>
          <AuthHeading kicker="Editor Desk" title="Editor Desk sign-in" lede="Editor Desk accounts sign in with their email and password." />
          <div className="mt-8">
            <LoginForm
              next={next}
              initialError={googleReturnError(typeof error === "string" ? error : null)}
              notice={reset === "1" ? "Your password was changed. Log in with the new one." : null}
            />
          </div>
        </>
      ) : (
        <>
          <AuthHeading
            kicker="Log in"
            title="Welcome back"
          />
          <div className="mt-8">
            <AuthOptions next={next} mode="login" initialError={googleReturnError(typeof error === "string" ? error : null)} />
          </div>
        </>
      )}
    </AuthShell>
  );
}
