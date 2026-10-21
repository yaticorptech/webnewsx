"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type TooltipProps = {
  content: ReactNode;
  /** A single focusable element (button/link). It receives aria-describedby. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  /** Hover delay in ms (focus shows immediately). */
  delay?: number;
  className?: string;
};

/**
 * Lightweight tooltip for mouse and keyboard users (hidden on touch). Supplementary only —
 * the trigger must still have its own accessible name.
 */
export function Tooltip({ content, children, side = "top", align = "center", delay = 350, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (immediate = false) => {
    clear();
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Never left hanging (owner 2026-10-16: "Verified" stayed up): the page can move under a still mouse, or focus can
    // land back on the trigger when a menu or popup closes — neither sends a "leave". So it also closes when the pointer
    // is over anything else, on any tap or click, on scroll, and when the window loses focus.
    const elsewhere = (event: Event) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointermove", elsewhere, { passive: true });
    document.addEventListener("pointerdown", close, { capture: true });
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointermove", elsewhere);
      document.removeEventListener("pointerdown", close, { capture: true });
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("blur", close);
    };
  }, [open]);

  if (!isValidElement(children)) return children;

  const describedBy = [children.props["aria-describedby"], open ? id : null].filter(Boolean).join(" ") || undefined;
  const trigger = cloneElement(children, { "aria-describedby": describedBy });

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onPointerEnter={(event) => event.pointerType === "mouse" && show()}
      onPointerLeave={hide}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches(":focus-visible")) show(true);
      }}
      onBlur={hide}
    >
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            id={id}
            initial={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "pointer-events-none absolute z-90 w-max max-w-60 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold leading-snug text-ink shadow-pop",
              side === "top" ? "bottom-full mb-2" : "top-full mt-2",
              align === "center" && "left-1/2 -translate-x-1/2",
              align === "start" && "left-0",
              align === "end" && "right-0",
              className,
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
