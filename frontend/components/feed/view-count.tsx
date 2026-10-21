import { Eye } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ViewCountProps = { count: number; size?: "sm" | "md"; className?: string };

/** Eye + compact live view count ("1.2K"); the exact figure is in the tooltip. */
export function ViewCount({ count, size = "sm", className }: ViewCountProps) {
  const md = size === "md";
  return (
    <span
      title={`${formatNumber(count)} ${count === 1 ? "view" : "views"}`}
      className={cn(
        "inline-flex items-center font-bold tabular-nums text-muted",
        md ? "h-10 gap-2 px-3.5 text-sm [&_svg]:size-5" : "h-9 gap-1.5 px-2.5 text-[0.8125rem] [&_svg]:size-4.5",
        className,
      )}
    >
      <Eye aria-hidden strokeWidth={2.25} />
      <NumberTicker value={count} />
      <span className="sr-only">{count === 1 ? " view" : " views"}</span>
    </span>
  );
}
