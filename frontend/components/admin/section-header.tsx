import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  /** Small line above the title (defaults to "Editor Desk"). */
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons aligned right on wide screens, under the copy on phones. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Page heading for every Editor Desk screen (owner 2026-10-16: "professional, not colours and text dumped"): a plain
 * title and one quiet line. The `kicker` is kept for callers but no longer shown (the top bar says where you are).
 */
export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Smaller heading inside a screen ("Editor's Picks", "Packages"). */
export function SubHeading({ title, aside, id, className }: { title: ReactNode; aside?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1", className)}>
      <h2 id={id} className="text-[0.9375rem] font-semibold text-ink">
        {title}
      </h2>
      {aside}
    </div>
  );
}
