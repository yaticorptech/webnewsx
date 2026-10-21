"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { NEWS_LANGUAGES, PRESS_LANGUAGE_LABELS, READ_LANGUAGES_MAX, type PressLanguage } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * "Languages you read" (owner 2026-10-05): asked at sign-up, editable in Settings — Home, the categories and Search
 * show stories in these languages first, then everything else. Chips in the Languages menu order; picked order is
 * kept as the menu order too. Up to READ_LANGUAGES_MAX — for reporters it's also their Press Pass list (`reporter`).
 */
export function ReadLanguagesPicker({
  value,
  onChange,
  error,
  reporter = false,
  className,
}: {
  value: PressLanguage[];
  onChange: (next: PressLanguage[]) => void;
  error?: string;
  /** Their profile and Press Pass show this list too. */
  reporter?: boolean;
  className?: string;
}) {
  const id = useId();
  const full = value.length >= READ_LANGUAGES_MAX;
  const toggle = (code: PressLanguage) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : NEWS_LANGUAGES.filter((c) => c === code || value.includes(c)));

  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)} aria-describedby={error ? `${id}-error` : `${id}-hint`}>
      <legend className="text-[0.8125rem] font-bold tracking-[0.01em] text-ink">
        Languages you read
        <span aria-hidden className="ml-0.5 text-brand-strong">
          *
        </span>
      </legend>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted">
        Your feeds show news in these languages first, then the rest.
        {reporter ? " Your profile and Press Pass show them too." : ""} Up to {READ_LANGUAGES_MAX}.
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {NEWS_LANGUAGES.map((code) => {
          const on = value.includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(code)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-semibold transition-colors disabled:opacity-40",
                on ? "border-brand bg-brand text-white" : "border-border bg-surface text-ink-2 enabled:hover:border-ink-2/40",
              )}
            >
              {on && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
              {PRESS_LANGUAGE_LABELS[code]}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {error && (
          <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-brand">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  );
}
