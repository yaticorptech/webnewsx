"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TabItem = {
  value: string;
  label: ReactNode;
  /** Link mode: every item has an href → renders a <nav> of links with aria-current. */
  href?: string;
  /** Small count badge after the label. */
  count?: number;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  value: string;
  /** Button mode callback (ignored in link mode). */
  onValueChange?: (value: string) => void;
  /** Accessible name for the tablist / nav. */
  ariaLabel: string;
  /** Stable id prefix; tab ids are `${id}-tab-${value}`, panels `${id}-panel-${value}`. */
  id?: string;
  /** Stretch tabs to fill the row. */
  fullWidth?: boolean;
  size?: "md" | "lg";
  className?: string;
};

/**
 * Section-style tabs (owner's previous platform): active item in crimson with a 2px crimson
 * underline that slides between items.
 * Button mode = WAI-ARIA tablist (arrow keys, Home/End); pair with <TabPanel>.
 * Link mode = navigation links (e.g. `/?tab=following`), active item from `value`.
 */
export function Tabs({ items, value, onValueChange, ariaLabel, id, fullWidth = false, size = "md", className }: TabsProps) {
  const generated = useId();
  const baseId = id ?? `tabs-${generated.replace(/:/g, "")}`;
  const linkMode = items.length > 0 && items.every((item) => item.href);
  const listRef = useRef<HTMLDivElement>(null);

  const itemClass = (active: boolean, disabled?: boolean) =>
    cn(
      // No outline-none: the global crimson :focus-visible ring must show (Tailwind v4 outline-none would cancel it).
      "relative inline-flex items-center justify-center gap-2 whitespace-nowrap px-1 font-bold font-wide transition-colors duration-150",
      "focus-visible:rounded-sm",
      size === "lg" ? "h-14 text-base" : "h-12 text-[0.9375rem]",
      fullWidth && "flex-1",
      active ? "text-brand" : "text-muted hover:text-ink",
      disabled && "pointer-events-none opacity-40",
    );

  const inner = (item: TabItem, active: boolean) => (
    <>
      <span>{item.label}</span>
      {typeof item.count === "number" && (
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[0.6875rem] font-bold tabular-nums",
            active ? "bg-brand text-brand-contrast" : "bg-surface-2 text-muted",
          )}
        >
          {compactNumber(item.count)}
        </span>
      )}
      {active && (
        <motion.span
          layoutId={`${baseId}-indicator`}
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      )}
    </>
  );

  const rowClass = cn("flex border-b border-border", fullWidth ? "gap-0" : "gap-7", className);

  if (linkMode) {
    return (
      <nav aria-label={ariaLabel} className={rowClass}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <Link
              key={item.value}
              href={item.href!}
              scroll={false}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              className={itemClass(active, item.disabled)}
            >
              {inner(item, active)}
            </Link>
          );
        })}
      </nav>
    );
  }

  const enabled = items.filter((item) => !item.disabled);
  const focusTab = (next: TabItem | undefined) => {
    if (!next) return;
    onValueChange?.(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${next.value}`)}`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((item) => item.value === value);
    if (event.key === "ArrowRight") focusTab(enabled[(index + 1) % enabled.length]);
    else if (event.key === "ArrowLeft") focusTab(enabled[(index - 1 + enabled.length) % enabled.length]);
    else if (event.key === "Home") focusTab(enabled[0]);
    else if (event.key === "End") focusTab(enabled[enabled.length - 1]);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className={rowClass} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.value}`}
            aria-selected={active}
            aria-controls={`${baseId}-panel-${item.value}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange?.(item.value)}
            className={itemClass(active, item.disabled)}
          >
            {inner(item, active)}
          </button>
        );
      })}
    </div>
  );
}

/** Panel for button-mode Tabs. Pass the same `tabsId` given to <Tabs id>. */
export function TabPanel({
  tabsId,
  value,
  active,
  className,
  children,
}: {
  tabsId: string;
  value: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel-${value}`}
      aria-labelledby={`${tabsId}-tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className={cn("rounded-lg focus-visible:outline-offset-4", className)}
    >
      {active && children}
    </div>
  );
}
