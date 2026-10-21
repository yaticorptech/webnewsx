import { SiteFooter } from "@/components/layout/site-footer";
import { ProfileNotFound } from "@/components/profile/profile-not-found";

/** Unknown or not-yet-onboarded username. */
export default function ProfileNotFoundPage() {
  return (
    <>
      <ProfileNotFound />
      <SiteFooter className="mt-4 rounded-2xl border" />
    </>
  );
}
