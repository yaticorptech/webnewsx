import { CircleDot, Clock3, EyeOff, FilePen, Star, Undo2 } from "lucide-react";
import type { StoryStatus } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

const COPY: Record<StoryStatus, { label: string; title: string }> = {
  published: { label: "Live", title: "Published — on the feeds now" },
  hidden: { label: "Hidden", title: "Hidden by the Editor Desk — off every feed" },
  in_review: { label: "In review", title: "Waiting at the Review Desk" },
  returned: { label: "Returned", title: "Returned by the Review Desk with a note — edit and resubmit" },
  draft: { label: "Draft", title: "Private draft" },
};

/** Story status chip for Newsroom rows (icon + word). */
export function StoryStatusChip({ status, className }: { status: StoryStatus; className?: string }) {
  const copy = COPY[status];
  return (
    <span
      data-story-status={status}
      title={copy.title}
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-bold leading-none [&_svg]:size-3",
        status === "published" && "bg-success-soft text-success-strong",
        status === "hidden" && "bg-surface-2 text-ink ring-1 ring-border-strong ring-inset",
        status === "in_review" && "bg-tint text-brand ring-1 ring-tint-border ring-inset",
        status === "returned" && "bg-brand text-brand-contrast",
        status === "draft" && "bg-surface-2 text-muted",
        className,
      )}
    >
      {status === "published" && <CircleDot aria-hidden />}
      {status === "hidden" && <EyeOff aria-hidden />}
      {status === "in_review" && <Clock3 aria-hidden />}
      {status === "returned" && <Undo2 aria-hidden />}
      {status === "draft" && <FilePen aria-hidden />}
      {copy.label}
    </span>
  );
}

export function EditorsPickChip({ className }: { className?: string }) {
  return (
    <span
      title="Editor's Pick — pinned by the Editor Desk"
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full bg-brand px-2 text-[0.6875rem] font-bold leading-none text-brand-contrast [&_svg]:size-3",
        className,
      )}
    >
      <Star aria-hidden className="fill-current" />
      Editor&apos;s Pick
    </span>
  );
}
