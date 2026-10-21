"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { Avatar } from "@/components/ui/avatar";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ChatPerson } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type PeoplePickerProps = {
  selected: ChatPerson[];
  onChange: (next: ChatPerson[]) => void;
  /** Pick one person only (tapping another replaces them). */
  single?: boolean;
  /** People who can't be picked (already in the chat), by id. */
  exclude?: ReadonlySet<string>;
  max?: number;
  autoFocus?: boolean;
  className?: string;
};

/**
 * "To:" search for people (Instagram's new-message picker): chips for who's picked, then search results — or, before
 * you type, the people you follow.
 */
export function PeoplePicker({ selected, onChange, single = false, exclude, max = 49, autoFocus = true, className }: PeoplePickerProps) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim().replace(/^@+/, ""));

  const suggested = useQuery({
    queryKey: qk.sendSuggestions,
    queryFn: ({ signal }) => api.messages.suggested(signal),
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => api.search(q, signal),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const people: ChatPerson[] = q
    ? (search.data?.users ?? [])
        .filter((u) => !u.isViewer)
        .map((u) => ({ id: u.id, username: u.username, name: u.name, image: u.image, reporterLevel: u.reporterLevel ?? null }))
    : (suggested.data?.people ?? []);
  const loading = q ? search.isPending : suggested.isPending;
  const picked = new Set(selected.map((p) => p.id));

  const toggle = (person: ChatPerson) => {
    if (picked.has(person.id)) onChange(selected.filter((p) => p.id !== person.id));
    else if (single) onChange([person]);
    else if (selected.length < max) onChange([...selected, person]);
    setText("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        <span className="mr-1 text-sm font-bold text-ink">To:</span>
        {selected.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => toggle(person)}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-tint-2 py-1 pl-2.5 pr-1.5 text-[0.8125rem] font-bold text-brand-strong hover:bg-tint-3"
            aria-label={`Remove ${person.name}`}
          >
            <span className="truncate">{person.name || person.username}</span>
            <X aria-hidden className="size-3.5 shrink-0" />
          </button>
        ))}
        <label className="flex min-w-32 flex-1 items-center gap-1.5">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && text === "" && selected.length > 0) onChange(selected.slice(0, -1));
            }}
            placeholder="Search people"
            aria-label="Search people"
            autoFocus={autoFocus}
            className="h-9 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-muted-2"
          />
        </label>
      </div>
      <p className="kicker mt-3 text-muted">{q ? "Results" : "Suggested"}</p>
      <ul className="-mx-2 mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <li className="flex justify-center py-8">
            <SpeedLinesLoader size="sm" label="Loading people" />
          </li>
        ) : people.length === 0 ? (
          <li className="px-2 py-8 text-center text-sm text-muted">
            {q ? "No one found." : "Search for someone by name or @username."}
          </li>
        ) : (
          people.map((person) => {
            const on = picked.has(person.id);
            const disabled = exclude?.has(person.id) ?? false;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(person)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-tint disabled:opacity-50"
                >
                  <Avatar src={person.image} name={person.name} size={44} decorative />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{person.name}</span>
                    <UserHandle username={person.username} truncate className="flex text-[0.8125rem] text-muted" />
                  </span>
                  {disabled ? (
                    <span className="text-xs font-semibold text-muted">Already in</span>
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        on ? "border-brand bg-brand text-brand-contrast" : "border-border-strong",
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
