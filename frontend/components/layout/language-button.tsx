"use client";

import { Check, ChevronDown, Globe, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { parseLanguages } from "@/components/feed/feed-views";
import { useViewer } from "@/components/providers/viewer-provider";
import { NEWS_LANGUAGES, PRESS_LANGUAGE_LABELS, type PressLanguage } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** The languages of a /language/<codes> page, else null. */
function pageLanguages(pathname: string): PressLanguage[] | null {
  const segment = /^\/language\/([^/]+)\/?$/.exec(pathname)?.[1];
  return segment ? parseLanguages(segment) : null;
}

/**
 * The Languages menu (owner 2026-10-05: moved from the category row to a small icon in the masthead, beside the bell).
 * Red while a language page is open. The panel opens under the icon (phones: under the top bar, across the screen) with
 * the account's own languages ticked (picked at sign-up / in Settings) — or, on a language page, the ones it shows. A new
 * pick here only changes what's shown: it never edits the account's languages (owner 2026-10-05).
 */
/** `text`: the desktop masthead's "English ▾" (owner 2026-10-15) — the same Languages panel, opening to the right. */
export function LanguageButton({ className, variant = "icon" }: { className?: string; variant?: "icon" | "text" }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = pageLanguages(pathname);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = current ? `Languages: ${current.map((code) => PRESS_LANGUAGE_LABELS[code]).join(", ")}` : "Languages";

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          variant === "text"
            ? "inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[0.8125rem] font-medium transition-colors hover:text-brand"
            : "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-tint-2 hover:text-brand after:absolute after:-inset-0.5 after:content-[''] max-sm:size-11",
          variant === "icon" && open && "bg-tint-2",
          open ? "text-brand" : current ? "text-brand" : "text-ink",
        )}
      >
        {variant === "text" ? (
          <>
            English
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} strokeWidth={2.5} />
          </>
        ) : (
          <Globe aria-hidden className="size-5 max-sm:size-[1.375rem]" />
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Languages"
          className={cn(
            "z-60 rounded-2xl border border-border bg-surface p-3 shadow-pop sm:p-4",
            "max-lg:fixed max-lg:right-4 max-lg:top-[calc(var(--bar-h)+var(--safe-top)+0.375rem)] max-lg:w-[min(26rem,calc(100vw-2rem))]",
            "lg:absolute lg:top-full lg:mt-2 lg:w-120",
            variant === "text" ? "lg:left-0" : "lg:right-0",
          )}
        >
          <LanguagePanel initial={current ?? viewer?.languages ?? []} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Every language of India, with a search box: tick one or several, then "Show news" opens their news first
 * (/language/hi,ta). The languages ticked on opening are listed first.
 */
function LanguagePanel({ initial, onPick }: { initial: PressLanguage[]; onPick: () => void }) {
  const [picked, setPicked] = useState<PressLanguage[]>(initial);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // The ones ticked when the panel opened lead the list, so none hides below the fold (owner 2026-10-05); the order
  // stays put while ticking.
  const [order] = useState(() => [...initial, ...NEWS_LANGUAGES.filter((code) => !initial.includes(code))]);
  const languages = order.filter((code) => PRESS_LANGUAGE_LABELS[code].toLowerCase().includes(needle));
  const toggle = (code: PressLanguage) =>
    setPicked((current) => (current.includes(code) ? current.filter((c) => c !== code) : NEWS_LANGUAGES.filter((c) => c === code || current.includes(c))));
  return (
    <>
      <p className="kicker mb-3 text-brand">Languages</p>
      <label className="flex h-10 items-center gap-2 rounded-full border border-border-strong px-3.5 text-sm transition-colors focus-within:border-brand">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="sr-only">Find a language</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a language"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
      </label>
      <ul className="mt-3 grid max-h-[min(50vh,16rem)] grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto overscroll-contain sm:grid-cols-3">
        {languages.map((code) => {
          const on = picked.includes(code);
          return (
            <li key={code}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(code)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] font-semibold transition-colors hover:bg-tint hover:text-brand",
                  on ? "bg-tint text-brand" : "text-ink-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[0.3rem] border transition-colors",
                    on ? "border-brand bg-brand text-brand-contrast" : "border-border-strong",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3.5} />}
                </span>
                <span className="truncate">{PRESS_LANGUAGE_LABELS[code]}</span>
              </button>
            </li>
          );
        })}
        {languages.length === 0 && <li className="col-span-full px-2.5 py-2 text-sm text-muted">No language matches “{query.trim()}”.</li>}
      </ul>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setPicked([])}
          disabled={picked.length === 0}
          className="h-10 rounded-full px-4 text-sm font-bold text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Clear
        </button>
        {picked.length > 0 ? (
          <Link
            href={`/language/${picked.join(",")}`}
            onClick={onPick}
            className="ml-auto flex h-10 items-center rounded-full bg-brand px-5 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            Show news{picked.length > 1 ? ` · ${picked.length} languages` : ` · ${PRESS_LANGUAGE_LABELS[picked[0]!]}`}
          </Link>
        ) : (
          <span className="ml-auto text-xs text-muted">Pick one or more languages</span>
        )}
      </div>
    </>
  );
}
