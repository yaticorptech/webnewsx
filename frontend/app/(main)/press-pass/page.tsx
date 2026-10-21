import type { Metadata } from "next";
import { PressPassView } from "@/components/presspass/press-pass-view";
import { getPressPass, getPressPassOptions } from "@/lib/server-api";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Press Pass",
  description: "Apply for your WebNEWS Press Pass and start publishing as a reporter.",
  robots: { index: false, follow: false },
};

/**
 * /press-pass (SPEC §3.11): Readers apply in three steps; holders view / download their pass.
 * Logged out → /login?next=/press-pass, not onboarded → /onboarding.
 */
export default async function PressPassPage() {
  const viewer = await requireOnboardedViewer("/press-pass");
  const [pass, options] = await Promise.all([getPressPass(), getPressPassOptions()]);
  return (
    <PressPassView
      viewer={{ name: viewer.name, username: viewer.username, image: viewer.image, role: viewer.role }}
      pass={pass}
      options={options}
    />
  );
}
