import { ProfileSkeleton } from "@/components/profile/profile-skeleton";

/** Profile-shaped placeholder while the profile and its first grid page load. */
function ProfileLoadingContent() {
  return <ProfileSkeleton />;
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function ProfileLoading() {
  return (
    <div data-route-loading="" className="contents">
      <ProfileLoadingContent />
    </div>
  );
}
