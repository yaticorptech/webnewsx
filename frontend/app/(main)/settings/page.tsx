import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your WebNEWS settings: Newsroom, Spotlight, advertorial price, connected accounts, password and help.",
  robots: { index: false },
};

/**
 * /settings (owner 2026-10-01): three options under the heading — Advertorial price · Connected accounts · Help center
 * (settings-view.tsx). Full screen width on desktop (data-grid-page widens the column).
 */
export default async function SettingsPage() {
  const viewer = await requireOnboardedViewer("/settings");
  return (
    <div data-grid-page="">
      {/* useSearchParams (?section=) inside. */}
      <Suspense>
        <SettingsView verifiedReporter={viewer.reporterLevel === "verified"} />
      </Suspense>
    </div>
  );
}
