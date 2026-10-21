"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title (always used as the accessible name). */
  title: ReactNode;
  description?: ReactNode;
  /** Visually hide the title/description header (still announced). */
  hideHeader?: boolean;
  children?: ReactNode;
  /** Sticky action row at the bottom. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** `auto` = centred dialog ≥640px, bottom sheet below. */
  variant?: "auto" | "dialog" | "sheet";
  /** Element to focus on open (defaults to the first focusable element). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Allow Esc / overlay click / close button / drag-down to close (default true). */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  /** The backdrop behind the panel (default: the light dim + slight blur). */
  overlayClassName?: string;
};

const SIZES = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" } as const;

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusableIn(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

let scrollLocks = 0;
/** Locks page scroll (shared count, so nested overlays unlock once the last one closes); returns the unlock. */
export function lockScroll(): () => void {
  scrollLocks += 1;
  if (scrollLocks === 1) document.documentElement.style.overflow = "hidden";
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.documentElement.style.overflow = "";
  };
}

const noopSubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Accessible modal dialog: portal, focus trap, Esc, scroll lock, focus restore.
 * Renders as a draggable bottom sheet on small screens (variant="auto").
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  hideHeader = false,
  children,
  footer,
  size = "md",
  variant = "auto",
  initialFocus,
  dismissible = true,
  className,
  bodyClassName,
  overlayClassName,
}: ModalProps) {
  const isClient = useIsClient();
  const small = useMediaQuery("(max-width: 639.98px)");
  const asSheet = variant === "sheet" || (variant === "auto" && small);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();
  const descriptionId = useId();

  const close = () => {
    if (dismissible) onOpenChange(false);
  };

  // Focus in on open, restore on close; lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    const frame = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? focusableIn(panelRef.current)[0] ?? panelRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      unlock();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  // Esc pressed before focus has moved in (it moves on the next frame — late on a slow device)
  // lands outside the dialog; close then too. Keys inside the dialog are handled by onKeyDown.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (panelRef.current?.parentElement?.contains(event.target as Node)) return;
      onOpenChangeRef.current(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissible]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) close();
  };

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn("fixed inset-0 z-100 flex justify-center", asSheet ? "items-end" : "items-center p-4 sm:p-6")}
          onKeyDown={onKeyDown}
        >
          <motion.div
            aria-hidden
            className={cn("absolute inset-0 bg-overlay backdrop-blur-xs", overlayClassName)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              "relative flex w-full flex-col overflow-hidden border border-border bg-surface text-ink shadow-pop outline-none",
              asSheet
                ? "max-h-[90dvh] rounded-t-2xl border-b-0 pb-[env(safe-area-inset-bottom)] sm:max-w-lg"
                : cn("max-h-[85dvh] rounded-2xl", SIZES[size]),
              className,
            )}
            {...(asSheet
              ? {
                  initial: { y: "100%" },
                  animate: { y: 0 },
                  exit: { y: "100%" },
                  transition: { type: "spring", damping: 34, stiffness: 340, mass: 0.9 },
                  drag: dismissible ? ("y" as const) : false,
                  dragControls,
                  dragListener: false,
                  dragConstraints: { top: 0, bottom: 0 },
                  dragElastic: { top: 0, bottom: 0.7 },
                  onDragEnd,
                }
              : {
                  initial: { opacity: 0, scale: 0.96, y: 12 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
                  transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] },
                })}
          >
            {/* Brand accent: a short crimson rule on the top edge. */}
            <span aria-hidden className="absolute left-0 top-0 h-0.75 w-20 rounded-br-full bg-brand" />

            {asSheet && (
              <div
                className="flex cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
                onPointerDown={(event) => dismissible && dragControls.start(event)}
              >
                <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
              </div>
            )}

            <header className={cn("flex items-start gap-4 px-5 sm:px-6", asSheet ? "pt-2" : "pt-6", hideHeader && "sr-only")}>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-wide text-xl font-extrabold leading-tight tracking-[-0.01em]">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X aria-hidden className="size-5" />
                </button>
              )}
            </header>

            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", bodyClassName)}>
              {children}
            </div>

            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Bottom sheet on every screen size (mobile menus, follower lists). */
export function Sheet(props: Omit<ModalProps, "variant">) {
  return <Modal {...props} variant="sheet" />;
}
