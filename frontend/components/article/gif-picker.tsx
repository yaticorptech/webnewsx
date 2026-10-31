"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CommentGif } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * The comment box's GIF picker (owner 2026-10-31): trending GIFs, or a search, from GIPHY in a two-column
 * masonry-free grid that scrolls inside the panel. Picking one hands its `CommentGif` back; Escape closes.
 */
export function GifPicker({ onPick, onClose, className }: { onPick: (gif: CommentGif) => void; onClose: () => void; className?: string }) {
  const searchId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  const gifs = useInfiniteQuery({
    queryKey: ["gifs", q],
    queryFn: ({ pageParam, signal }) => api.gifs(q, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 5 * 60_000,
  });
  const items = gifs.data?.pages.flatMap((page) => page.items) ?? [];
  const configured = gifs.data?.pages[0]?.configured ?? true;

  // Load the next page when the end of the grid scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = gifs;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div
      role="dialog"
      aria-label="Choose a GIF"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop", className)}
    >
      <div className="flex items-center gap-2 border-b border-border p-2">
        <label htmlFor={searchId} className="sr-only">
          Search GIFs
        </label>
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-2 px-3.5">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <input
            ref={input}
            id={searchId}
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search GIPHY"
            autoComplete="off"
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close GIFs"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint hover:text-brand"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="h-64 overflow-y-auto overscroll-contain p-2 sm:h-72">
        {!configured ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">GIFs are coming soon.</p>
        ) : gifs.isError ? (
          <p className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            Couldn&rsquo;t load GIFs.
            <button type="button" onClick={() => void gifs.refetch()} className="font-semibold text-brand hover:underline">
              Try again
            </button>
          </p>
        ) : gifs.isPending ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-busy="true" aria-label="Loading GIFs">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">No GIFs for &ldquo;{q}&rdquo;.</p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item.gif)}
                    aria-label={item.gif.title || "GIF"}
                    className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-2 outline-offset-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <img src={item.preview} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
            <div ref={sentinel} className="h-6" />
          </>
        )}
      </div>

      {/* GIPHY's attribution rule: "Powered by GIPHY" wherever its results show. */}
      <p className="border-t border-border px-3 py-1.5 text-right text-[0.6875rem] font-bold tracking-wide text-muted">Powered by GIPHY</p>
    </div>
  );
}
