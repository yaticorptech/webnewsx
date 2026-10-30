import type { Metadata } from "next";
import { SiteSetup } from "@/components/publisher/site-setup";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Your website", robots: { index: false } };

/** Settings → Your domain → Set up website (owner 2026-10-29): full screen, outside the app shell. */
export default async function SiteSetupPage() {
  await requireOnboardedViewer("/site-setup");
  return (
    <div id="main">
      <SiteSetup />
    </div>
  );
}
