"use client";

import { EditorContent, type Editor } from "@tiptap/react";
import { Check } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { LIMITS } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./editor-toolbar";
import { LinkDialog } from "./link-dialog";

export type StoryEditorProps = {
  editor: Editor | null;
  /** Normalized plain text (for the counters). */
  text: string;
  invalid: boolean;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
};

/**
 * Framed rich-text area: sticky formatting toolbar (slides under the nav, or to the very top when the
 * phone nav hides), the Tiptap surface styled like the published article, and live counters.
 */
export function StoryEditor({ editor, text, invalid, linkOpen, onLinkOpenChange }: StoryEditorProps) {
  const [focused, setFocused] = useState(false);
  const count = text.length;
  const min = LIMITS.bodyTextMin;
  const max = LIMITS.bodyTextMax;
  const nearMax = count >= max * 0.9;

  return (
    <div
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      // Tinted like the headline's box (owner 2026-10-08) so it reads as a field; white with a red ring while typing.
      className={cn(
        "rounded-xl border-[1.5px] transition-[border-color,background-color,box-shadow] duration-150",
        focused
          ? "border-brand bg-surface shadow-[0_0_0_3px_var(--brand-soft)]"
          : invalid
            ? "border-brand bg-tint"
            : "border-tint-border bg-tint/60 hover:border-brand/60 hover:bg-tint-2",
      )}
    >
      <div
        className={cn(
          "sticky top-(--nav-h) z-20 rounded-t-[0.6875rem] border-b border-tint-border/70 bg-surface/95 px-1.5 py-1 backdrop-blur-md",
          "transition-[top] duration-300 ease-snap motion-reduce:transition-none",
          // The phone nav slides away on scroll-down: follow it to the top edge.
          "[body:has(header[data-hidden])_&]:top-0",
        )}
      >
        <EditorToolbar editor={editor} onLink={() => onLinkOpenChange(true)} />
      </div>

      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div aria-hidden className="flex min-h-40 flex-col gap-3 px-4 py-4 sm:min-h-48 sm:px-5">
          <Skeleton shape="text" className="h-4 w-11/12" />
          <Skeleton shape="text" className="h-4 w-10/12" />
          <Skeleton shape="text" className="h-4 w-7/12" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-tint-border/70 px-4 py-2.5 text-xs text-muted sm:px-5">
        <p className="tabular-nums">
          <span className={cn(nearMax && "font-bold text-brand")}>
            {formatNumber(count)}
            {nearMax && ` / ${formatNumber(max)}`}
          </span>{" "}
          {count === 1 ? "character" : "characters"}
        </p>
        <MinimumMeter count={count} min={min} />
      </div>

      <LinkDialog editor={editor} open={linkOpen} onOpenChange={onLinkOpenChange} />
    </div>
  );
}

/** "12 more to publish" with a tiny slanted meter; turns into a check once the minimum is met. */
function MinimumMeter({ count, min }: { count: number; min: number }) {
  const done = count >= min;
  const fraction = Math.min(1, count / min);
  return (
    <p className={cn("flex items-center gap-2 font-semibold", done ? "text-success" : "text-muted")}>
      {done ? (
        <>
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
          Long enough to publish
        </>
      ) : (
        <>
          <span aria-hidden className="relative h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-300 ease-snap"
              style={{ width: `${fraction * 100}%` }}
            />
          </span>
          {min - count} more to publish
        </>
      )}
    </p>
  );
}
