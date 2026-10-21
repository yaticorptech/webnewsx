import { ColumnPageSkeleton } from "@/components/layout/status-views";

/** Settings placeholder (the group-level loading.tsx is shaped like the front page). */
function SettingsLoadingContent() {
  return <ColumnPageSkeleton label="Loading settings" />;
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function SettingsLoading() {
  return (
    <div data-route-loading="" className="contents">
      <SettingsLoadingContent />
    </div>
  );
}
