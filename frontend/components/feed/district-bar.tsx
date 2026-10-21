"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { CATEGORY_LABELS, KARNATAKA_DISTRICTS, categoryPath } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * The Karnataka page's districts (owner 2026-10-12: tapping Karnataka opens its page with all Karnataka news; the
 * district is picked here): "All Karnataka" then every district as chips in one sideways row, the open one in red and
 * kept in view; the search icon narrows the row to the districts that match.
 */
export function DistrictBar({ district }: { district: string | null }) {
  const rowRef = useRef<HTMLUListElement>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const districts = KARNATAKA_DISTRICTS.filter((name) => name.toLowerCase().includes(needle));

  useLayoutEffect(() => {
    const row = rowRef.current;
    const item = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !item) return;
    row.scrollLeft = item.offsetLeft - (row.clientWidth - item.offsetWidth) / 2;
  }, [district]);

  const chip = (on: boolean) =>
    cn(
      "flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors",
      on ? "bg-brand text-brand-contrast" : "bg-surface-2 text-ink-2 hover:bg-tint hover:text-brand",
    );

  return (
    <nav aria-label="Karnataka districts" className="mb-4 flex items-center gap-2">
      {searching ? (
        <label className="flex h-9 w-44 shrink-0 items-center gap-2 rounded-full border border-brand px-3 text-sm sm:w-56">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Find a district</span>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a district"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={() => {
              setSearching(false);
              setQuery("");
            }}
            className="text-muted hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </label>
      ) : (
        <button
          type="button"
          aria-label="Find a district"
          title="Find a district"
          onClick={() => setSearching(true)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-tint hover:text-brand"
        >
          <Search aria-hidden className="size-4" />
        </button>
      )}
      <ul ref={rowRef} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {!needle && (
          <li>
            <Link href={categoryPath("karnataka")} aria-current={!district ? "page" : undefined} className={chip(!district)}>
              All {CATEGORY_LABELS.karnataka}
            </Link>
          </li>
        )}
        {districts.map((name) => (
          <li key={name}>
            <Link href={categoryPath("karnataka", name)} aria-current={district === name ? "page" : undefined} className={chip(district === name)}>
              {name}
            </Link>
          </li>
        ))}
        {districts.length === 0 && <li className="flex h-9 items-center px-2 text-sm text-muted">No district matches “{query.trim()}”.</li>}
      </ul>
    </nav>
  );
}
