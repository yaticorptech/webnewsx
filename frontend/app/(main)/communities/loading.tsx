import { CommunitiesSkeleton } from "@/components/communities/communities-view";

function CommunitiesLoadingContent() {
  return <CommunitiesSkeleton />;
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function CommunitiesLoading() {
  return (
    <div data-route-loading="" className="contents">
      <CommunitiesLoadingContent />
    </div>
  );
}
