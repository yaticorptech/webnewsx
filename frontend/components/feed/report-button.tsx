"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import type { FlagReason } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { FlagDialog, useReportedReason } from "./flag-dialog";

export type ReportButtonProps = {
  /** A story card / detail: `viewer.reported` = the viewer already reported it. */
  article: { id: string; title: string; viewer?: { reported?: FlagReason | null } };
  size?: "sm" | "md";
  /** Show the word "Report" next to the flag (article page). */
  showLabel?: boolean;
  className?: string;
};

/**
 * Report a story (owner 2026-09-26: its own button, no longer inside the ⋯ menu) → the reason sheet → the
 * Editor Desk's Flags queue. Logged out, it opens the log-in prompt; once reported it turns red and stays put.
 */
export function ReportButton({ article, size = "sm", showLabel = false, className }: ReportButtonProps) {
  const authPrompt = useAuthPrompt();
  const [open, setOpen] = useState(false);
  // Mount the sheet on first use only (every feed card has this button).
  const [mounted, setMounted] = useState(false);
  const reported = useReportedReason(article) !== null;
  const md = size === "md";
  const label = reported ? "Reported to the Editor Desk" : "Report story";

  return (
    <>
      <button
        type="button"
        aria-label={showLabel ? undefined : label}
        aria-disabled={reported || undefined}
        title={label}
        onClick={() => {
          if (reported) return;
          if (!authPrompt.guard("Log in to report a story")) return;
          setMounted(true);
          setOpen(true);
        }}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full font-bold transition-colors duration-150",
          "after:absolute after:-inset-1.5 after:content-['']",
          md ? "h-10 gap-2 px-3 text-sm" : "size-9 text-[0.8125rem]",
          reported ? "cursor-default text-brand" : "text-muted hover:bg-tint hover:text-brand",
          className,
        )}
      >
        <Flag aria-hidden strokeWidth={2.25} className={cn(md ? "size-5" : "size-4.5", reported && "fill-brand")} />
        {showLabel && <span>{reported ? "Reported" : "Report"}</span>}
      </button>
      {mounted && <FlagDialog articleId={article.id} title={article.title} open={open} onOpenChange={setOpen} />}
    </>
  );
}
