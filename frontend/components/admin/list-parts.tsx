"use client";

import { Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ─────────────── Segmented filter (radio group of pills) ─────────────── */

export type SegmentOption<V extends string> = { value: V; label: ReactNode; count?: number };

type SegmentedProps<V extends string> = {
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
};

/** Pill filter row (WAI-ARIA radio group: arrows move + select). Scrolls sideways on phones. */
export function Segmented<V extends string>({ label, options, value, onChange, className }: SegmentedProps<V>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:flex-wrap sm:px-0", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1);
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1);
        else return;
        event.preventDefault();
      }}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-bold transition-colors duration-150",
              active ? "text-brand-contrast" : "text-ink-2 ring-1 ring-inset ring-border hover:bg-surface-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-seg`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-brand shadow-[0_1px_2px_rgb(227_6_19/0.25)]"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{option.label}</span>
            {typeof option.count === "number" && (
              <span
                className={cn(
                  "relative rounded-full px-1.5 text-[0.6875rem] tabular-nums",
                  active ? "bg-white/20 text-brand-contrast" : "bg-surface-2 text-muted",
                )}
              >
                {compactNumber(option.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────── Debounced search ─────────────── */

type SearchBoxProps = {
  label: string;
  placeholder?: string;
  value: string;
  /** Called 300ms after typing stops (and immediately on clear / Enter). */
  onSearch: (value: string) => void;
  className?: string;
};

export function SearchBox({ label, placeholder, value, onSearch, className }: SearchBoxProps) {
  const [draft, setDraft] = useState(value);
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Debounce: push the draft upstream once typing pauses.
  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = setTimeout(() => onSearchRef.current(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim());
      }}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-full border border-border-strong bg-surface pl-3.5 pr-1.5 transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)] sm:w-72",
        className,
      )}
    >
      <Search aria-hidden className="size-4 shrink-0 text-muted" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onSearch("");
          }}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </form>
  );
}

/* ─────────────── Paging + states ─────────────── */

export function LoadMore({ hasMore, loading, onLoad, label = "Load more" }: { hasMore: boolean; loading: boolean; onLoad: () => void; label?: string }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-5">
      <Button variant="outline" onClick={onLoad} loading={loading}>
        {label}
      </Button>
    </div>
  );
}

/** Loading shimmer for a desk list (while a new filter loads). */
export function ListLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="card flex items-center justify-center gap-3 py-14 text-muted">
      <SpeedLinesLoader size="md" label={null} />
      <span className="kicker">{label}</span>
    </div>
  );
}

export function ListEmpty({ title, description, icon, action }: { title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return <EmptyState size="md" as="h2" icon={icon} title={title} description={description} action={action} />;
}

export function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="panel-tint flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="font-wide text-base font-extrabold text-ink">This list didn&apos;t load</p>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Screen-reader announcement for list changes ("3 stories"). */
export function LiveCount({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}

/* ─────────────── Native select / date filters ─────────────── */

const fieldBox =
  "h-10 rounded-full border border-border-strong bg-surface px-3.5 text-sm text-ink transition-[border-color,box-shadow] hover:border-muted-2 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--tint-3)] focus-visible:outline-none";

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="kicker text-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={cn(fieldBox, "pr-8")}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextFilter({
  label,
  value,
  onCommit,
  placeholder,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  /** Called on blur / Enter (text) or on change (date). */
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="kicker text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={type === "date" ? value : draft}
        placeholder={placeholder}
        onChange={(event) => (type === "date" ? onCommit(event.target.value) : setDraft(event.target.value))}
        onBlur={() => type !== "date" && draft.trim() !== value && onCommit(draft.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter" && type !== "date") onCommit(draft.trim());
        }}
        className={cn(fieldBox, "min-w-0")}
      />
    </div>
  );
}
