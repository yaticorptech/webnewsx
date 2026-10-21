import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readNextParam, type PageSearchParams } from "@/components/auth/next-path";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { OnboardingHeader } from "@/components/onboarding/onboarding-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ADMIN_HOME } from "@/lib/admin-home";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Set up your profile",
  description: "Choose your username, name and photo to start using WebNEWS.",
  robots: { index: false },
};

/**
 * Required profile setup after sign-up (SPEC §3.9). Logged-out visitors → /login; finished
 * profiles → `next` or "/". Lives outside `(main)` because that layout redirects here.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: PageSearchParams }) {
  const next = await readNextParam(searchParams);
  const viewer = await requireViewer("/onboarding");
  if (viewer.onboarded && viewer.username) redirect(viewer.role === "admin" ? ADMIN_HOME : (next ?? "/"));

  return (
    <>
      <OnboardingHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-275 px-4 pt-8 pb-20 outline-none sm:px-6 sm:pt-12 lg:pt-14">
        <div className="animate-fade-up">
          <OnboardingForm viewer={viewer} next={next} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
