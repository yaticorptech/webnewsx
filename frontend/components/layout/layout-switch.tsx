"use client";

import { LayoutGrid, SquarePlay, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFeedLayout } from "@/components/providers/feed-layout-provider";
import type { FeedLayout } from "@/lib/feed-layout";
import { cn } from "@/lib/utils";
import { showsCategoryNav } from "./category-nav";

const LAYOUTS: readonly { value: FeedLayout; icon: LucideIcon; label: string }[] = [
  { value: "grid", icon: LayoutGrid, label: "Grid" },
  { value: "reel", icon: SquarePlay, label: "Reels" },
];

/**
 * Grid or reels for Home and every category (owner 2026-10-05; redesign 2026-10-07: both layouts stay). One toggle
 * switch (owner 2026-10-16): a pill track with a round knob that slides — left = grid, right = reels — and carries the
 * current layout's icon; the track turns red for reels. Only on the feed pages (where it changes what's on screen).
 * `labels` / `squared` are kept for the callers; the switch looks the same everywhere.
 */
export function LayoutSwitch({ className }: { labels?: boolean; squared?: boolean; className?: string }) {
  const { layout, setLayout } = useFeedLayout();
  const pathname = usePathname();
  if (!showsCategoryNav(pathname)) return null;
  const reels = layout === "reel";
  const current = LAYOUTS.find((option) => option.value === layout) ?? LAYOUTS[0]!;
  const next = reels ? "grid" : "reel";
  const Icon = current.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={reels}
      aria-label="Reels layout"
      title={reels ? "Showing reels — switch to grid" : "Showing grid — switch to reels"}
      onClick={() => setLayout(next)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-200 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
        // Grid too in the brand colour (owner 2026-10-16: "highlighted, not grey"): a soft red track, the icon in red.
        reels ? "bg-brand" : "bg-brand/15 ring-1 ring-brand/35 ring-inset hover:bg-brand/25",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-6 items-center justify-center rounded-full bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.25)] transition-transform duration-200 ease-snap motion-reduce:transition-none",
          reels ? "translate-x-6 text-brand" : "translate-x-0 text-brand",
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.4} />
      </span>
    </button>
  );
}
