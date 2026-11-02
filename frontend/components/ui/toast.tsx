"use client";

import { Check, Info, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────────── Store ─────────────────────────── */

export type ToastVariant = "default" | "success" | "error" | "warning" | "live";

export type ToastAction = {
  label: string;
  /** Navigate on click (client-side). */
  href?: string;
  onClick?: () => void;
};

export type ToastOptions = {
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  /** ms before auto-dismiss (default 5000, errors 7000). 0 = sticky. */
  duration?: number;
  /** Reusing an id replaces that toast (dedupe repeated errors). */
  id?: string;
  /**
   * The old look (owner 2026-10-08, for the app's "Press back again to exit"): a small plain card at the bottom, above
   * the tab bar — not the alert card at the top.
   */
  classic?: boolean;
};

export type ToastRecord = Required<Pick<ToastOptions, "variant" | "duration" | "id">> &
  Omit<ToastOptions, "variant" | "duration" | "id"> & { title: string; createdAt: number };

const MAX_VISIBLE = 3;
let toasts: ToastRecord[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function push(title: string, options: ToastOptions = {}): string {
  const id = options.id ?? `t${Date.now().toString(36)}${(counter++).toString(36)}`;
  const variant = options.variant ?? "default";
  const record: ToastRecord = {
    ...options,
    id,
    title,
    variant,
    duration: options.duration ?? (variant === "error" ? 7000 : 5000),
    createdAt: Date.now(),
  };
  toasts = [record, ...toasts.filter((t) => t.id !== id)].slice(0, MAX_VISIBLE);
  emit();
  return id;
}

function dismiss(id?: string) {
  toasts = id ? toasts.filter((t) => t.id !== id) : [];
  emit();
}

/**
 * Show a toast from anywhere (client). Returns its id.
 *   toast("Link copied")
 *   toast.success("Your story is live", { action: { label: "View story", href: "/a/slug" } })
 *   toast.error("Couldn't follow", { description: err.message })
 */
export const toast = Object.assign(push, {
  success: (title: string, options?: Omit<ToastOptions, "variant">) => push(title, { ...options, variant: "success" }),
  error: (title: string, options?: Omit<ToastOptions, "variant">) => push(title, { ...options, variant: "error" }),
  /** Red, but not an error — e.g. "You're logged out". */
  warning: (title: string, options?: Omit<ToastOptions, "variant">) => push(title, { ...options, variant: "warning" }),
  live: (title: string, options?: Omit<ToastOptions, "variant">) => push(title, { ...options, variant: "live" }),
  dismiss,
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => toasts;
// Must be referentially stable, or React re-renders forever.
const EMPTY: ToastRecord[] = [];
const getServerSnapshot = (): ToastRecord[] => EMPTY;

/* ─────────────────────────── UI ─────────────────────────── */

/**
 * Mount once (AppProviders). Alert cards bottom right at every width (owner 2026-10-08; on phones above the tab bar);
 * `classic` ones ("Press back again to exit") bottom-centre on phones, as before.
 */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const cards = items.filter((item) => !item.classic);
  const classic = items.filter((item) => item.classic);
  return (
    <>
      <section
        aria-label="Notifications"
        // The bottom-right corner (owner 2026-10-08): on phones right against the edge, just above the tab bar.
        className="pointer-events-none fixed right-3 bottom-[calc(var(--tabbar-h)+0.75rem+env(safe-area-inset-bottom))] z-120 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:right-6 md:bottom-6"
      >
        <AnimatePresence initial={false}>
          {cards.map((item) => (
            <ToastCard key={item.id} toast={item} />
          ))}
        </AnimatePresence>
      </section>
      <section
        aria-label="Messages"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-120 flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end md:px-0"
      >
        <AnimatePresence initial={false}>
          {classic.map((item) => (
            <ClassicToastCard key={item.id} toast={item} />
          ))}
        </AnimatePresence>
      </section>
    </>
  );
}

/**
 * The card's look (owner 2026-11-02: "latest trending UI"; replaces the lime / red tinted pills): one calm white card
 * with a soft shadow; each kind has its own icon in a tinted circle and a thin progress line along the bottom showing
 * when it closes (paused while hovered).
 */
type Tone = { badge: string; bar: string; icon: ReactNode };
const TONES: Record<ToastVariant, Tone> = {
  success: { badge: "bg-success-soft text-success-strong", bar: "bg-success", icon: <Check strokeWidth={3} /> },
  default: { badge: "bg-surface-2 text-ink-2", bar: "bg-ink-2/40", icon: <Info strokeWidth={2.4} /> },
  live: {
    badge: "bg-tint text-brand",
    bar: "bg-brand",
    icon: (
      <span className="relative flex size-2.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
        <span className="relative size-2.5 rounded-full bg-brand" />
      </span>
    ),
  },
  warning: { badge: "bg-tint text-brand", bar: "bg-brand", icon: <Info strokeWidth={2.4} /> },
  error: { badge: "bg-brand text-white", bar: "bg-brand", icon: <TriangleAlert strokeWidth={2.4} /> },
};

function ToastCard({ toast: item }: { toast: ToastRecord }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (item.duration === 0 || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [item.id, item.duration, paused]);

  const isError = item.variant === "error";
  const tone = TONES[item.variant];

  return (
    <motion.div
      layout
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        // Compact (owner 2026-10-08 / 2026-11-02: not full width on phones): as wide as its text, at most 23rem.
        "pointer-events-auto relative flex w-fit max-w-[min(23rem,calc(100vw-2.5rem))] items-start gap-3 overflow-hidden rounded-2xl",
        "border border-border bg-surface/95 py-3.5 pl-3.5 pr-2 backdrop-blur-md",
        "shadow-[0_1px_2px_rgb(16_18_24/0.06),0_18px_44px_-14px_rgb(16_18_24/0.28)]",
      )}
    >
      <span aria-hidden className={cn("mt-px flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4.5", tone.badge)}>
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[0.9375rem] font-bold leading-snug text-ink">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            className="mt-2 inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-ink-2"
            onClick={() => {
              const href = item.action?.href;
              item.action?.onClick?.();
              if (href) router.push(href);
              dismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className="-mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-4" strokeWidth={2.25} />
      </button>
      {/* Time left before it closes: a thin line that empties (stops while hovered). */}
      {item.duration > 0 && (
        <span
          aria-hidden
          className={cn("absolute bottom-0 left-0 h-0.75 w-full origin-left animate-toast-time", tone.bar)}
          style={{ animationDuration: `${item.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
        />
      )}
    </motion.div>
  );
}

/** The old toast (`classic`): a small white card with a grey edge on the left, the message and a close button. */
function ClassicToastCard({ toast: item }: { toast: ToastRecord }) {
  useEffect(() => {
    if (item.duration === 0) return;
    const timer = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration]);

  return (
    <motion.div
      layout
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="pointer-events-auto relative flex w-full max-w-104 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface py-3 pl-5 pr-2 text-ink shadow-pop"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-border-strong" />
      <div className="min-w-0 flex-1 py-px">
        <p className="text-sm font-bold leading-snug">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(item.id)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </motion.div>
  );
}
