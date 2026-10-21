"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
 * The card's colours by variant (owner 2026-10-12, from their reference): one look for every toast — a pale tinted
 * card with a border, a filled warning triangle, dark title, grey description and a solid pill button on the right.
 * Lime for everything except errors and warnings (e.g. logout), which are red.
 */
type Tone = { card: string; icon: string; text: string; sub: string; action: string; close: string };
const LIME: Tone = {
  card: "border-[#8cc63f] bg-[#eefbcb] shadow-[0_10px_30px_-12px_rgb(60_90_20/0.35)]",
  icon: "text-[#8cc63f]",
  text: "text-[#2f362c]",
  sub: "text-[#5d6659]",
  action: "bg-[#8cc63f] text-white hover:bg-[#7bb32f]",
  close: "text-[#2f362c] hover:bg-black/5",
};
const RED: Tone = {
  card: "border-[#e5534b] bg-[#fde8e6] shadow-[0_10px_30px_-12px_rgb(120_30_20/0.35)]",
  icon: "text-[#e5534b]",
  text: "text-[#3a2a29]",
  sub: "text-[#6b5856]",
  action: "bg-[#e5534b] text-white hover:bg-[#d2423a]",
  close: "text-[#3a2a29] hover:bg-black/5",
};
const TONES: Record<ToastVariant, Tone> = { success: LIME, default: LIME, live: LIME, error: RED, warning: RED };

function ToastIcon({ variant }: { variant: ToastVariant }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 [&_svg]:size-6", TONES[variant].icon)}>
      {/* Filled rounded triangle with a white "!". */}
      <svg viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M10.27 3.5a2 2 0 0 1 3.46 0l8.2 14.2A2 2 0 0 1 20.2 20.7H3.8a2 2 0 0 1-1.73-3L10.27 3.5Z"
        />
        <path stroke="white" strokeWidth={2.4} strokeLinecap="round" d="M12 9v4.5M12 17.2v.05" />
      </svg>
    </span>
  );
}

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
  // A message with a description AND a button (owner 2026-10-15: the text was squeezed into a thin column beside the
  // button): the button goes under the text, everything top-aligned, ✕ in the corner.
  const stacked = Boolean(item.description && item.action);
  const actionButton = item.action && (
    <button
      type="button"
      className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[0.875rem] font-bold transition-colors", tone.action)}
      onClick={() => {
        const href = item.action?.href;
        item.action?.onClick?.();
        if (href) router.push(href);
        dismiss(item.id);
      }}
    >
      {item.action.label}
    </button>
  );

  return (
    <motion.div
      layout
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      // Compact (owner 2026-10-08: not full width on phones): as wide as its text, at most 22rem.
      className={cn(
        "pointer-events-auto relative flex max-w-[min(24rem,calc(100vw-1.5rem))] gap-3 overflow-hidden rounded-[1.75rem] border-2 py-3 pl-4 pr-2",
        stacked ? "w-[min(24rem,calc(100vw-1.5rem))] items-start py-4" : "w-fit items-center",
        tone.card,
      )}
    >
      <span className={cn("flex", stacked && "pt-0.5")}>
        <ToastIcon variant={item.variant} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[0.9375rem] font-bold leading-snug", tone.text)}>{item.title}</p>
        {item.description && <p className={cn("mt-1 text-[0.8125rem] leading-snug", tone.sub)}>{item.description}</p>}
        {stacked && <div className="mt-3">{actionButton}</div>}
      </div>
      {!stacked && actionButton}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 transition-colors hover:opacity-100",
          stacked && "-mt-1",
          tone.close,
        )}
      >
        <X aria-hidden className="size-4.5" strokeWidth={2.25} />
      </button>
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
