"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, X } from "lucide-react";
import { useId, useState } from "react";
import { useDebounced } from "@/components/messages/people-picker";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { PlaceSuggestion } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** Letters and digits only, lower case — as the API compares. */
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A city box that suggests places while typing (owner 2026-10-05): every city, town and village whose name starts
 * with the letters typed ("ba" → Bantwal, Bajpe … never Kadaba) — old spellings too ("Mangalore" → Mangaluru) — with
 * its district, towns first (GET /api/places, India Post's directory). `state` / `district` narrow the list; with a
 * district chosen, focusing shows its towns. The text stays free. Wires into <Field> like Input. Used by the Press Pass
 * form and the press meet reporter picker.
 */
export function CityInput({
  value,
  onChange,
  onPick,
  state = "",
  district = "",
  selected,
  icon = false,
  placeholder,
  maxLength,
  invalid,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  /** A suggestion was chosen (its name is also passed to `onChange`). */
  onPick?: (place: PlaceSuggestion) => void;
  /** Region code; "" = all of India. */
  state?: string;
  /** Limits the list to this district's places ("" = the whole state). */
  district?: string;
  /** A place has been picked (no list until the text changes); unset = when the text is exactly a suggestion. */
  selected?: boolean;
  /** A building icon at the start (the reporter picker's filter row). */
  icon?: boolean;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(value.trim(), 150);

  const places = useQuery({
    queryKey: qk.places(q, state, district),
    queryFn: ({ signal }) => api.places({ q, state, district }, signal),
    enabled: open && Boolean(q || district),
    staleTime: Infinity,
    // Keep the last list while the next one loads (filtered below to what's typed now).
    placeholderData: keepPreviousData,
  });

  // Only names (or old spellings) that start with what's in the box now; none once a place is picked.
  const typed = norm(value);
  const found = (places.data?.items ?? []).filter(
    (place) => !typed || norm(place.name).startsWith(typed) || (place.matchedAka !== null && norm(place.matchedAka).startsWith(typed)),
  );
  const done = selected ?? found.some((place) => place.name.toLowerCase() === value.trim().toLowerCase());
  const matches = done ? [] : found;
  const expanded = open && matches.length > 0;

  const pick = (place: PlaceSuggestion) => {
    setOpen(false);
    onChange(place.name);
    onPick?.(place);
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        invalid={invalid}
        prefix={icon ? <Building2 className="size-4.5" /> : undefined}
        inputClassName={cn("font-semibold placeholder:font-normal placeholder:text-muted", icon && "pl-2")}
        suffix={
          value ? (
            <button type="button" onClick={() => onChange("")} aria-label="Clear city" className="text-muted hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
          ) : undefined
        }
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!expanded) {
              setOpen(true);
              return;
            }
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + matches.length) % matches.length);
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]!);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />

      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Cities, towns and villages"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface py-1.5 shadow-pop"
        >
          {matches.map((place, i) => (
            <li
              key={`${place.state}-${place.district}-${place.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the box (no blur before the pick).
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(place)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2 text-sm",
                i === active ? "bg-tint text-ink" : "text-ink-2",
              )}
            >
              <span className="min-w-0 truncate font-semibold">
                {place.name}
                {place.matchedAka && <span className="font-normal text-muted"> ({place.matchedAka})</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{place.district}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
