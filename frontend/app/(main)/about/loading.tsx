import { ColumnPageSkeleton } from "@/components/layout/status-views";

/** /about placeholder (the group-level loading.tsx is shaped like the front page). */
function AboutLoadingContent() {
  return <ColumnPageSkeleton label="Loading" />;
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function AboutLoading() {
  return (
    <div data-route-loading="" className="contents">
      <AboutLoadingContent />
    </div>
  );
}
