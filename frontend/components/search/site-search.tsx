"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Play, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Avatar } from "@/components/ui/avatar";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { SEARCH_LIMITS, type ArticleCard, type SearchResults, type UserRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";

/*
 * Masthead search (owner rule 2026-09-25): as you type, people (username / name) and stories (headline / text)
 * are listed at once — GET /api/search, debounced a moment so every keystroke doesn't hit the server. A combobox:
 * ↑/↓ move through the results, Enter opens one (the first when none is highlighted), Esc closes.
 * The masthead only shows a small search icon (owner rule): since 2026-09-30 it opens the Search page (/explore), which
 * uses this combobox as its field (`variant="page"`).
 */

const DEBOUNCE_MS = 120;

type ResultItem =
  { key: string; href: string; kind: "user"; user: UserRow } | { key: string; href: string; kind: "story"; story: ArticleCard };

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useSearchResults(text: string) {
  const query = useDebounced(text.replace(/\s+/g, " ").trim().replace(/^@+/, "").slice(0, SEARCH_LIMITS.queryMax), DEBOUNCE_MS);
  const result = useQuery({
    queryKey: qk.search(query.toLowerCase()),
    queryFn: ({ signal }) => api.search(query, signal),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return { query, ...result };
}

function toItems(data: SearchResults | undefined): ResultItem[] {
  if (!data) return [];
  return [
    ...data.users.map((user) => ({ key: `u:${user.id}`, href: `/${user.username}`, kind: "user" as const, user })),
    ...data.stories.map((story) => ({ key: `s:${story.id}`, href: `/a/${story.slug}`, kind: "story" as const, story })),
  ];
}

/** The typed words in bold red inside a result. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.toLowerCase();
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1 && needle; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="bg-transparent font-extrabold text-brand">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/**
 * Search field + live results. `onNavigate` runs after a result is opened; `onClose` on Esc with no text.
 * `panel` = the masthead's compact panel; `page` = the Explore page (owner 2026-09-30): a larger field, results in the
 * page's own scroll, `onFocus` when the field is tapped and `trailing` beside it (its Cancel).
 */
export function SearchCombobox({
  inputRef,
  onNavigate,
  onClose,
  variant = "panel",
  onFocus,
  trailing,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onNavigate: () => void;
  onClose: () => void;
  variant?: "panel" | "page";
  onFocus?: () => void;
  trailing?: ReactNode;
}) {
  const page = variant === "page";
  const router = useRouter();
  const listId = useId();
  const [text, setText] = useState("");
  /** Highlighted result, remembered per query: a new result list starts with nothing highlighted. */
  const [highlight, setHighlight] = useState<{ query: string; index: number }>({ query: "", index: -1 });
  const { query, data, isFetching, isError } = useSearchResults(text);
  const items = useMemo(() => toItems(query ? data : undefined), [data, query]);
  const showResults = text.trim().length > 0;
  const active = highlight.query === query ? highlight.index : -1;
  const setActive = (index: number) => setHighlight({ query, index });

  const go = (item: ResultItem | undefined) => {
    if (!item) return;
    track("search", { label: text.trim().slice(0, 80), props: { opened: item.kind } });
    setText("");
    onNavigate();
    router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(items[active >= 0 ? active : 0]);
    } else if (event.key === "Escape") {
      // First Esc clears the field; the next one closes the panel.
      event.preventDefault();
      if (text) setText("");
      else onClose();
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const users = items.filter((item) => item.kind === "user");
  const stories = items.filter((item) => item.kind === "story");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search people and stories"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Search people & stories"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            className={cn(
              "w-full rounded-full border border-border-strong bg-surface pl-9 pr-9 font-medium text-ink placeholder:text-muted",
              page ? "h-11 border-transparent bg-surface-2 text-[0.9375rem]" : "h-10 text-sm",
              "transition-[border-color,box-shadow] duration-150 focus:border-brand focus:shadow-[0_0_0_3px_var(--tint-2)] focus:outline-none",
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          {text && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText("");
                inputRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink after:absolute after:-inset-2 after:content-['']"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
        {trailing}
      </div>

      {showResults && (
        <div className={cn("-mx-2 mt-2", !page && "max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain")}>
          <div id={listId} role="listbox" aria-label="Search results" className="flex flex-col">
            {users.length > 0 && (
              <Group label="People">
                {users.map((item) => {
                  const index = items.indexOf(item);
                  return item.kind === "user" ? (
                    <ResultLink
                      key={item.key}
                      id={optionId(index)}
                      href={item.href}
                      active={index === active}
                      onHover={() => setActive(index)}
                      onOpen={() => go(item)}
                    >
                      <Avatar src={item.user.image} name={item.user.name} size="sm" decorative />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-ink">
                            <Highlight text={item.user.name} query={query} />
                          </span>
                          {item.user.reporterLevel === "verified" && <VerifiedBadge size={13} animate={false} tooltip={false} />}
                        </span>
                        <UserHandle username={item.user.username} truncate className="flex text-xs text-muted" />
                      </span>
                    </ResultLink>
                  ) : null;
                })}
              </Group>
            )}
            {stories.length > 0 && (
              <Group label="Stories">
                {stories.map((item) => {
                  const index = items.indexOf(item);
                  return item.kind === "story" ? (
                    <ResultLink
                      key={item.key}
                      id={optionId(index)}
                      href={item.href}
                      active={index === active}
                      onHover={() => setActive(index)}
                      onOpen={() => go(item)}
                    >
                      <span className="relative h-9 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                        {item.story.coverUrl && (
                          <img src={item.story.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
                        )}
                        {item.story.video && (
                          <span className="absolute inset-0 flex items-center justify-center bg-ink/25 text-white">
                            <Play aria-hidden className="size-3 fill-current" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[0.8125rem] font-bold leading-snug text-ink">
                          <Highlight text={item.story.title} query={query} />
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                          <UserHandle username={item.story.author.username} truncate className="flex" />
                          <span aria-hidden>·</span>
                          <TimeAgo date={item.story.publishedAt} variant="short" className="shrink-0" />
                        </span>
                      </span>
                    </ResultLink>
                  ) : null;
                })}
              </Group>
            )}
          </div>
          {items.length === 0 && (
            <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
              {isFetching || query !== text.replace(/\s+/g, " ").trim().replace(/^@+/, "") ? (
                <>
                  <SpeedLinesLoader size="xs" label={null} />
                  Searching…
                </>
              ) : isError ? (
                "Search didn't work. Please try again."
              ) : (
                <>No people or stories match “{text.trim()}”.</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="py-0.5">
      <p id={id} role="presentation" className="kicker px-3 pb-0.5 pt-1.5 text-[0.625rem] text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultLink({
  id,
  href,
  active,
  onHover,
  onOpen,
  children,
}: {
  id: string;
  href: string;
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      id={id}
      href={href}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseEnter={onHover}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onOpen();
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
        active ? "bg-tint" : "hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The masthead's search icon (owner 2026-09-30): opens the Search page (/explore — the field on top, stories as a
 * grid of posters) on every screen size, like the phone's Search tab. It used to open a small panel under the icon.
 */
export function SearchButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = pathname === "/explore";
  return (
    <Link
      href="/explore"
      aria-label="Search people and stories"
      title="Search"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-tint-2 hover:text-brand after:absolute after:-inset-0.5 after:content-['']",
        active ? "bg-tint-2 text-brand" : "text-ink",
        className,
      )}
    >
      <Search aria-hidden className="size-5" />
    </Link>
  );
}
