import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { googleReturnError } from "@/components/auth/auth-errors";
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
  const { error, reset } = await searchParams;

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
      <AuthHeading kicker="Log in" title="Welcome back" lede="Log in to follow publishers, like and save the stories that matter — and report with your Press Pass." />
      <div className="mt-8">
        <LoginForm
          next={next}
          initialError={googleReturnError(typeof error === "string" ? error : null)}
          notice={reset === "1" ? "Your password was changed. Log in with the new one." : null}
        />
      </div>
    </AuthShell>
  );
}
