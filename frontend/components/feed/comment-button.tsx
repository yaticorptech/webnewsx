"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import type { CommentsSource } from "@/components/article/comments";
import { CommentsSheet } from "@/components/article/comments-sheet";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CommentButtonProps = {
  article: CommentsSource;
  count: number;
  size?: "sm" | "md";
  /** On the story's own page: jump to its comments instead of opening the story. */
  onPage?: boolean;
  /** Composer preview: renders, does nothing. */
  inert?: boolean;
  className?: string;
};

/**
 * Speech bubble + live comment count → the story's comments in a sheet right there, like Instagram (owner
 * 2026-10-05; on the story's own page it jumps to its comments section). Writing one still needs an account: the
 * sheet's composer shows "Log in to comment" when logged out.
 */
export function CommentButton({ article, count, size = "sm", onPage = false, inert = false, className }: CommentButtonProps) {
  const [open, setOpen] = useState(false);
  const md = size === "md";
  const label = `Comments · ${formatNumber(count)} ${count === 1 ? "comment" : "comments"}`;
  const classes = cn(
    "relative inline-flex items-center rounded-full font-bold tabular-nums text-muted transition-colors duration-150 hover:bg-tint hover:text-brand",
    "after:absolute after:-inset-1.5 after:content-['']",
    md ? "h-10 gap-2 px-3.5 text-sm" : "h-9 gap-1.5 px-2.5 text-[0.8125rem]",
    className,
  );
  const content = (
    <>
      <MessageCircle aria-hidden strokeWidth={2.25} className={md ? "size-5" : "size-4.5"} />
      <NumberTicker value={count} />
    </>
  );
  if (inert) {
    return (
      <span aria-label={label} className={classes}>
        {content}
      </span>
    );
  }
  if (onPage) {
    return (
      <a href="#comments" aria-label={label} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <>
      <button type="button" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)} className={classes}>
        {content}
      </button>
      <CommentsSheet article={article} open={open} onOpenChange={setOpen} />
    </>
  );
}
