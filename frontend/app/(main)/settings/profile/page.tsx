import type { Metadata } from "next";
import Link from "next/link";
import { SpeedLines } from "@/components/brand/speed-lines";
import { BackButton } from "@/components/layout/back-button";
import { LeaveAccount } from "@/components/settings/leave-account";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Edit profile",
  description: "Change your WebNEWS name, username, photo and bio.",
  robots: { index: false },
};

/**
 * Profile settings (SPEC §3.1): same fields as onboarding. Account details and Log out moved to /settings (owner
 * 2026-10-01). No "View profile" button (owner 2026-10-02): the back arrow returns to the profile.
 */
export default async function SettingsProfilePage() {
  const viewer = await requireOnboardedViewer("/settings/profile");

  return (
    // Full screen (owner 2026-10-23): `data-grid-page` lifts the shell's column limit.
    <div data-grid-page="" className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div data-own-back="" className="flex items-center gap-3">
            <BackButton fallback="/settings" />
            <p className="kicker flex items-center gap-2 text-brand">
              <SpeedLines />
              Settings
            </p>
          </div>
          <h1 className="mt-3 font-wide text-[2rem] leading-[1.02] font-black tracking-tight text-ink sm:text-[2.5rem]">
            Edit profile
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">Changes show up on your profile and bylines right away.</p>
        </div>
      </header>

      <ProfileSettingsForm viewer={viewer} />

      <p className="text-sm text-muted">
        Your advertorial price, password, connected accounts, help and Log out are in{" "}
        <Link href="/settings" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
          Settings
        </Link>
        .
      </p>

      {/* Deactivate or delete (owner 2026-10-23); while posting as a group, its owner deletes the group. */}
      <LeaveAccount />
    </div>
  );
}
