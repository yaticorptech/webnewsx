import { UserHandle } from "@/components/brand/user-handle";
import type { AdminStoryRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { StoryStatusChip } from "./chips";
import { StoryThumb } from "./story-thumb";

/** Compact "which story" block at the top of a desk dialog. */
export function StorySummary({ story, className }: { story: Pick<AdminStoryRow, "title" | "coverUrl" | "coverBlur" | "status"> & { author: { username: string } }; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-border bg-surface-2/60 p-3", className)}>
      <StoryThumb src={story.coverUrl} blur={story.coverBlur} className="w-20" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{story.title || "Untitled story"}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">
            by <UserHandle username={story.author.username} />
          </span>
          <StoryStatusChip status={story.status} />
        </p>
      </div>
    </div>
  );
}
