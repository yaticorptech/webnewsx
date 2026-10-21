"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { controlBox } from "@/components/ui/input";
import type { PressLanguage } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type LanguagePickerProps = {
  options: readonly { value: PressLanguage; label: string }[];
  value: readonly PressLanguage[];
  onChange: (value: PressLanguage[]) => void;
  max: number;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Multi-select dropdown for the languages a reporter files in (owner 2026-09-26: every language of India): a box
 * that opens a searchable checkbox list (up to `max` picks), with the picks as removable chips under it.
 * Escape or a click outside closes the list.
 */
export function LanguagePicker({ options, value, onChange, max, invalid = false, describedBy }: LanguagePickerProps) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const atLimit = value.length >= max;
  const needle = query.trim().toLowerCase();
  const shown = options.filter((option) => option.label.toLowerCase().includes(needle));
  const labelOf = (code: PressLanguage) => options.find((option) => option.value === code)?.label ?? code;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("[data-language-toggle]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (code: PressLanguage) =>
    onChange(value.includes(code) ? value.filter((v) => v !== code) : atLimit ? [...value] : [...value, code]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-language-toggle
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[0.9375rem] font-semibold", controlBox, invalid && "border-brand")}
      >
        <span className={cn("truncate", value.length === 0 && "font-normal text-muted")}>
          {value.length === 0 ? "Choose languages" : value.map(labelOf).join(", ")}
        </span>
        <ChevronDown aria-hidden className={cn("size-4.5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={listId} className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-2xl border border-border bg-surface p-2 shadow-pop">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm focus-within:border-brand">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="sr-only">Search languages</span>
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search languages"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
            />
          </label>
          <p className="px-2 pb-1 pt-2 text-xs text-muted">
            {value.length} / {max} chosen{atLimit ? " — remove one to pick another" : ""}
          </p>
          <ul className="max-h-64 overflow-y-auto overscroll-contain">
            {shown.map((option) => {
              const checked = value.includes(option.value);
              const blocked = atLimit && !checked;
              return (
                <li key={option.value}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors",
                      checked ? "bg-tint text-brand" : "text-ink hover:bg-surface-2",
                      blocked && "cursor-not-allowed opacity-45 hover:bg-transparent",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked}
                      onChange={() => toggle(option.value)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                        checked ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface",
                      )}
                    >
                      {checked && <Check className="size-3.5" strokeWidth={3.5} />}
                    </span>
                    {option.label}
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">No language matches “{query.trim()}”.</li>}
          </ul>
        </div>
      )}

      {value.length > 0 && (
        <ul aria-label="Chosen languages" className="mt-2.5 flex flex-wrap gap-1.5">
          {value.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`Remove ${labelOf(code)}`}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-tint-border bg-tint pl-3 pr-2 text-xs font-bold text-brand transition-colors hover:bg-tint-2"
              >
                {labelOf(code)}
                <X aria-hidden className="size-3.5" strokeWidth={2.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
