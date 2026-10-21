"use client";

import { Heart } from "lucide-react";
import { motion } from "motion/react";
import { SpeedLinesBurst } from "@/components/brand/speed-lines-motion";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LikeApi } from "./use-like";

export type LikeButtonProps = {
  like: LikeApi;
  count: number;
  size?: "sm" | "md";
  className?: string;
};

/** Heart toggle: pops with a spring and a burst of speed lines on like; the count rolls. */
export function LikeButton({ like, count, size = "sm", className }: LikeButtonProps) {
  const { liked, burst } = like;
  const md = size === "md";
  return (
    <button
      type="button"
      onClick={like.toggle}
      aria-pressed={liked}
      aria-label={`Like · ${formatNumber(count)} ${count === 1 ? "like" : "likes"}`}
      className={cn(
        "group/like relative inline-flex items-center rounded-full font-bold tabular-nums transition-colors duration-150",
        "after:absolute after:-inset-1.5 after:content-['']",
        md ? "h-10 gap-2 px-3.5 text-sm" : "h-9 gap-1.5 px-2.5 text-[0.8125rem]",
        liked ? "text-brand" : "text-muted hover:text-brand",
        "hover:bg-tint active:scale-95 motion-reduce:active:scale-100",
        className,
      )}
    >
      <span className={cn("relative inline-flex", md ? "size-5" : "size-4.5")}>
        <motion.span
          key={burst}
          className="inline-flex size-full"
          initial={burst > 0 ? { scale: 0.55 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 14, mass: 0.6 }}
        >
          <Heart
            aria-hidden
            strokeWidth={2.25}
            className={cn("size-full transition-[fill,color] duration-150", liked ? "fill-brand text-brand" : "fill-transparent")}
          />
        </motion.span>
        {burst > 0 && <SpeedLinesBurst key={`b${burst}`} size={md ? 46 : 40} />}
      </span>
      <NumberTicker value={count} />
    </button>
  );
}
