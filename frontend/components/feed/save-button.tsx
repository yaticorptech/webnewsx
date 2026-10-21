"use client";

import { Bookmark } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { SaveApi } from "./use-save";

export type SaveButtonProps = {
  save: SaveApi;
  size?: "sm" | "md";
  /** Show "Save" / "Saved" next to the icon (article page). */
  showLabel?: boolean;
  className?: string;
};

/**
 * "Save for later" bookmark: fills with the brand red and drops in with a small spring when saved.
 * `aria-pressed` carries the state; the accessible name stays "Save story".
 */
export function SaveButton({ save, size = "sm", showLabel = false, className }: SaveButtonProps) {
  const { saved } = save;
  const md = size === "md";
  return (
    <button
      type="button"
      onClick={save.toggle}
      aria-pressed={saved}
      aria-label="Save story"
      title={saved ? "Saved — tap to remove" : "Save for later"}
      data-save-button
      className={cn(
        "group/save relative inline-flex items-center justify-center rounded-full font-bold transition-colors duration-150",
        "after:absolute after:-inset-1.5 after:content-['']",
        md ? "h-10 gap-2 px-3 text-sm" : "h-9 gap-1.5 px-2.5 text-[0.8125rem]",
        saved ? "text-brand" : "text-muted hover:text-brand",
        "hover:bg-tint active:scale-95 motion-reduce:active:scale-100",
        className,
      )}
    >
      <motion.span
        key={saved ? "saved" : "idle"}
        className={cn("inline-flex", md ? "size-5" : "size-4.5")}
        initial={saved ? { y: -5, scale: 0.7 } : false}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 560, damping: 16, mass: 0.6 }}
      >
        <Bookmark
          aria-hidden
          strokeWidth={2.25}
          className={cn("size-full transition-[fill,color] duration-150", saved ? "fill-brand text-brand" : "fill-transparent")}
        />
      </motion.span>
      {showLabel && (
        <span aria-hidden className="max-[23.75rem]:hidden">
          {saved ? "Saved" : "Save"}
        </span>
      )}
    </button>
  );
}
