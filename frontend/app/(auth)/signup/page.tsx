import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { readNextParam, type PageSearchParams } from "@/components/auth/next-path";
import { AuthOptions } from "@/components/auth/auth-options";
import { redirectIfLoggedIn } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create account",
  description: "Join WebNEWS — publish news stories, follow publishers and be part of the Pulse of People.",
  robots: { index: false },
};

export default async function SignupPage({ searchParams }: { searchParams: PageSearchParams }) {
  const next = await readNextParam(searchParams);
  await redirectIfLoggedIn(next ?? "/");

  return (
    <AuthShell
      panel={{
        kicker: "The open newsroom",
        title: (
          <>
            Everyone&rsquo;s a
            <br />
            correspondent.
          </>
        ),
        lede: "Join as a Reader, get your Press Pass and publish your first article. Once the Review Desk trusts your byline, it lands in every open feed the moment you publish.",
      }}
    >
      <AuthHeading
        kicker="Create account"
        title="Your byline starts here"
      />
      <div className="mt-8">
        <AuthOptions next={next} mode="signup" />
      </div>
    </AuthShell>
  );
}
