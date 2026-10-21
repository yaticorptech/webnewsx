import type { ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  /** Custom icon (lucide). Defaults to the speed-lines mark. */
  icon?: ReactNode;
  /** Small uppercase line above the title (e.g. "Following"). */
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons / links. */
  action?: ReactNode;
  /** `md` = full panel (feed/profile), `sm` = compact (rails, modals). */
  size?: "sm" | "md";
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3" | "p";
  className?: string;
};

/**
 * Editorial empty state on the soft pink panel (`md`): the mark in a white disc with a pink rule,
 * wide heavy title, muted copy and an action. Used for empty feeds, grids, lists and fallbacks.
 */
export function EmptyState({
  icon,
  kicker,
  title,
  description,
  action,
  size = "md",
  as: Heading = "h2",
  className,
}: EmptyStateProps) {
  const md = size === "md";
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden text-center",
        md ? "panel-tint px-6 py-12 sm:px-10 sm:py-16" : "px-4 py-8",
        className,
      )}
    >
      {md && (
        <SpeedBarsSvg className="pointer-events-none absolute -bottom-10 -right-14 -z-10 w-64 text-brand opacity-[0.05]" />
      )}
      <div
        className={cn(
          "relative mb-5 flex items-center justify-center rounded-full border border-tint-border bg-surface text-brand shadow-card",
          md ? "size-16" : "size-12",
        )}
      >
        <span className={cn("relative", md ? "[&_svg]:size-7" : "[&_svg]:size-5")}>
          {icon ?? <SpeedBarsSvg className={md ? "w-8" : "w-6"} />}
        </span>
      </div>
      {kicker && <p className="kicker mb-2 text-brand-strong">{kicker}</p>}
      <Heading
        className={cn(
          "max-w-md font-wide font-extrabold leading-tight tracking-[-0.01em] text-ink",
          md ? "text-xl sm:text-2xl" : "text-base",
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className={cn("mt-2 max-w-sm leading-relaxed text-muted", md ? "text-[0.9375rem]" : "text-sm")}>{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
