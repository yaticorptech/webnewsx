import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";

export type PageHeaderProps = {
  title: ReactNode;
  /** One short line under the title. */
  subtitle?: ReactNode;
  /** Buttons at the end of the row (they wrap under the title on narrow phones). */
  actions?: ReactNode;
  /** "below": the buttons under the subtitle, lined up with the title (Communities, owner 2026-10-10). */
  actionsPlacement?: "end" | "below";
  /** Where the back arrow goes when there is no history; null = no arrow. */
  back?: string | null;
  /** `id` of the <h1> (for aria-labelledby). */
  id?: string;
  /** A smaller title (e.g. a pane's header). */
  compact?: boolean;
  className?: string;
};

/**
 * A page's header (redesign 2026-10-07, like Instagram / Facebook): the back arrow beside a big bold title, an
 * optional line under it and the page's buttons at the row's end. One look for Messages, Communities, the Newsroom
 * and the other app pages (it replaces the "kicker over a headline" headers). The arrow isn't shown in the Android app
 * (the phone's own back button does it).
 */
export function PageHeader({ title, subtitle, actions, actionsPlacement = "end", back = "/", id, compact = false, className }: PageHeaderProps) {
  const below = actionsPlacement === "below";
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)}>
      {/* The arrow on the title's own line (owner 2026-10-10: "in front of the title"), the line under it lined up with
          the title. In the app the arrow is hidden and its column takes no room. */}
      <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center">
        {back !== null && (
          <span data-app-no-back="" className="mr-2.5 flex">
            <BackButton fallback={back} plain />
          </span>
        )}
        <h1
          id={id}
          className={cn(
            "col-start-2 font-wide font-black leading-tight tracking-tight text-ink",
            compact ? "text-2xl" : "text-[1.625rem] max-[359px]:text-2xl sm:text-[2rem]",
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="col-start-2 mt-0.5 text-sm leading-snug text-muted sm:text-[0.9375rem]">{subtitle}</p>}
        {actions && below && <div className="col-start-2 mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {actions && !below && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
