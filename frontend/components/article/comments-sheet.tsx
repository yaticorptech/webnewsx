"use client";

import { Modal } from "@/components/ui/modal";
import { useArticleStats } from "@/components/feed/live-state";
import { formatNumber } from "@/lib/format";
import { Comments, type CommentsSource } from "./comments";

/**
 * A story's comments right where the reader is (owner 2026-10-05, "like how it works in insta"): a bottom sheet on
 * phones, a dialog on wider screens — no trip into the story. Following a link inside (a profile, a @mention) closes it.
 */
export function CommentsSheet({
  article,
  open,
  onOpenChange,
}: {
  article: CommentsSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stats = useArticleStats(article);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Comments · ${formatNumber(stats.commentCount)}`}
      size="md"
      className="h-[80dvh] sm:h-[min(80dvh,44rem)]"
      bodyClassName="flex flex-col overflow-hidden p-0 sm:p-0"
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a[href]")) onOpenChange(false);
        }}
      >
        <Comments article={article} sheet />
      </div>
    </Modal>
  );
}
