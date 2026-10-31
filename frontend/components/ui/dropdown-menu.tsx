"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type DropdownItem =
  | {
      type?: "item";
      label: ReactNode;
      icon?: ReactNode;
      /** Navigates (client-side) and closes. */
      href?: string;
      /** Runs and closes (ignored when `href` is set). */
      onSelect?: () => void;
      /** Brand-red destructive styling (Log out, Delete). */
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: "separator" }
  | { type: "label"; label: ReactNode };

export type DropdownMenuProps = {
  /** Accessible name of the trigger button (e.g. "Account menu"). */
  label: string;
  /** Visible trigger content (icon, avatar, chevron…). */
  trigger: ReactNode;
  triggerClassName?: string;
  items: DropdownItem[];
  /** Optional header inside the panel (e.g. "Signed in as …"). */
  header?: ReactNode;
  /** Makes the header a link (first menu item) that navigates and closes. */
  headerHref?: string;
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
  /** Controlled: open from outside (e.g. right after an action), told about every open / close. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Draw the panel on top of the page, fixed under the trigger (owner 2026-10-31): for triggers inside a scrolling /
   * clipped box (the Editor Desk's tables), where the panel would otherwise be cut off.
   */
  floating?: boolean;
};

/**
 * Menu button (WAI-ARIA APG pattern): Enter/Space/↓ opens on the first item, ↑ on the last,
 * arrows/Home/End move, Esc closes and returns focus, Tab and outside clicks close.
 */
export function DropdownMenu({
  label,
  trigger,
  triggerClassName,
  items,
  header,
  headerHref,
  align = "end",
  className,
  menuClassName,
  open: openProp,
  onOpenChange,
  floating = false,
}: DropdownMenuProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = useId();

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  // Focus the first/last item once the panel has mounted.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = menuItems();
      (focusOnOpen.current === "last" ? list[list.length - 1] : list[0])?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Outside pointer closes (without stealing focus from where the user clicked).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const [place, setPlace] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const openWith = (where: "first" | "last") => {
    focusOnOpen.current = where;
    if (floating && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPlace(
        align === "end" ? { top: rect.bottom + 8, right: window.innerWidth - rect.right } : { top: rect.bottom + 8, left: rect.left },
      );
    }
    setOpen(true);
  };

  // A floating panel stays put under its trigger only while nothing scrolls.
  useEffect(() => {
    if (!open || !floating) return;
    const onMove = () => close(false);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, floating, close]);

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWith("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWith("last");
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => list[(next + list.length) % list.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(list.length - 1);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const itemClass = (danger?: boolean, disabled?: boolean) =>
    cn(
      "group/item flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold outline-none transition-colors",
      "[&_svg]:size-[1.05rem] [&_svg]:shrink-0",
      danger
        ? "text-brand-strong hover:bg-tint-2 focus-visible:bg-tint-2"
        : "text-ink hover:bg-tint focus-visible:bg-tint [&_svg]:text-muted hover:[&_svg]:text-brand focus-visible:[&_svg]:text-brand",
      disabled && "pointer-events-none opacity-45",
    );

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.97,
            y: -4,
            transition: { duration: 0.12 },
          }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          style={
            floating && place
              ? {
                  position: "fixed",
                  top: place.top,
                  left: place.left,
                  right: place.right,
                }
              : undefined
          }
          className={cn(
            "z-80 min-w-56 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-pop",
            floating ? (align === "end" ? "origin-top-right" : "origin-top-left") : "absolute top-full mt-2",
            !floating && (align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"),
            menuClassName,
          )}
        >
          {header &&
            (headerHref ? (
              <Link
                href={headerHref}
                role="menuitem"
                tabIndex={-1}
                className="block rounded-md px-3 pb-2 pt-2.5 outline-none transition-colors hover:bg-tint focus-visible:bg-tint"
                onClick={() => close(false)}
              >
                {header}
              </Link>
            ) : (
              <div className="px-3 pb-2 pt-2.5">{header}</div>
            ))}
          {items.map((item, i) => {
            if (item.type === "separator") {
              return <div key={`sep-${i}`} role="separator" className="-mx-1.5 my-1.5 h-px bg-border" />;
            }
            if (item.type === "label") {
              return (
                <div key={`label-${i}`} role="presentation" className="kicker px-3 pb-1 pt-2 text-muted">
                  {item.label}
                </div>
              );
            }
            const content = (
              <>
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </>
            );
            if (item.href && !item.disabled) {
              return (
                <Link
                  key={i}
                  href={item.href}
                  role="menuitem"
                  tabIndex={-1}
                  className={itemClass(item.danger)}
                  onClick={() => close(false)}
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                className={itemClass(item.danger, item.disabled)}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {floating && typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
    </div>
  );
}
