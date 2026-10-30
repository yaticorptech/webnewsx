"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Field } from "@/components/ui/field";
import { CATEGORY_VALUES, type Category, type SiteLanguage } from "@/lib/shared/contracts";
import { categoryName } from "./site-i18n";

/**
 * The site's menu and language (owner 2026-10-30: "ask which categories to show in the navbar"; English default). Ticked
 * categories show in the order set here (arrows); none ticked = automatic, every category with stories, most first. A
 * ticked category with no stories yet stays out of the menu until it has one.
 */
export function MenuCard({
  posted,
  chosen,
  onChosen,
  language,
  onLanguage,
}: {
  posted: Category[];
  chosen: Category[] | null;
  onChosen: (next: Category[] | null) => void;
  language: SiteLanguage;
  onLanguage: (next: SiteLanguage) => void;
}) {
  const ticked = chosen ?? [];
  const rest = [...posted.filter((c) => !ticked.includes(c)), ...CATEGORY_VALUES.filter((c) => !ticked.includes(c) && !posted.includes(c))];
  const toggle = (category: Category) => {
    const next = ticked.includes(category) ? ticked.filter((c) => c !== category) : [...ticked, category];
    onChosen(next.length ? next : null);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...ticked];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChosen(next);
  };

  const row = (category: Category, index: number | null) => {
    const on = index !== null;
    const hasStories = posted.includes(category);
    return (
      <li key={category} className="flex items-center gap-2 py-1.5">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={on} onChange={() => toggle(category)} className="size-4 shrink-0 accent-brand" />
          <span className="truncate">{categoryName(category, "en")}</span>
          <span className="truncate text-xs text-muted">{categoryName(category, "kn")}</span>
          {!hasStories && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">no stories yet</span>}
        </label>
        {on && (
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Move ${categoryName(category, "en")} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30">
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button type="button" aria-label={`Move ${categoryName(category, "en")} down`} disabled={index === ticked.length - 1} onClick={() => move(index, 1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30">
              <ArrowDown aria-hidden className="size-4" />
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="font-wide text-lg font-extrabold text-ink">Menu &amp; language</h2>
      <Field label="Site language" hint="Menus, labels and dates. Visitors can switch with (EN) / (ಕನ್ನಡ); stories stay in the language they were written in.">
        <div role="radiogroup" aria-label="Site language" className="grid grid-cols-2 gap-2">
          {(["en", "kn"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              onClick={() => onLanguage(value)}
              className={`h-11 rounded-xl border text-sm font-semibold transition ${language === value ? "border-brand bg-tint text-brand-strong" : "border-border-strong bg-surface text-ink hover:border-brand"}`}
            >
              {value === "en" ? "English" : "ಕನ್ನಡ Kannada"}
            </button>
          ))}
        </div>
      </Field>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Menu categories</p>
          {chosen && (
            <button type="button" onClick={() => onChosen(null)} className="text-xs font-semibold text-brand hover:underline">
              Use automatic
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {chosen
            ? "Shown in this order after Home. Use the arrows to reorder."
            : "Automatic: every category you've posted in, most stories first. Tick categories to choose your own."}
        </p>
        <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto pr-1">
          {ticked.map((c, i) => row(c, i))}
          {rest.map((c) => row(c, null))}
        </ul>
      </div>
    </section>
  );
}
