"use client";

import { Check } from "lucide-react";
import { CATEGORY_VALUES, type Category } from "@/lib/shared/contracts";
import { categoryName } from "./site-i18n";

/**
 * The site's menu (owner 2026-10-30: one menu for both languages — names switch with the visitor's toggle; no language
 * setting, every site opens in English) — picked
 * from a grid; unticking everything leaves only Home). The menu follows the order categories are ticked in (the number
 * on each tile). Never saved yet (null): every category with stories, most first, shown ticked. A ticked category with
 * no stories yet stays out of the menu until it has one.
 */
export function MenuCard({
  posted,
  chosen,
  onChosen,
}: {
  posted: Category[];
  chosen: Category[] | null;
  onChosen: (next: Category[]) => void;
}) {
  const ticked = chosen ?? posted;
  const tiles = [...posted, ...CATEGORY_VALUES.filter((c) => !posted.includes(c))];
  const toggle = (category: Category) =>
    onChosen(ticked.includes(category) ? ticked.filter((c) => c !== category) : [...ticked, category]);

  return (
    <section className="card flex flex-col gap-5 p-5">
      <h2 className="font-wide text-lg font-extrabold text-ink">Menu</h2>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            Menu categories <span className="font-normal text-muted">· {ticked.length} shown</span>
          </p>
          <span className="flex gap-3 text-xs font-semibold">
            <button type="button" onClick={() => onChosen(posted)} className="text-brand hover:underline">
              Select all with stories
            </button>
            <button type="button" onClick={() => onChosen([])} className="text-muted hover:text-ink hover:underline">
              Clear
            </button>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">Shown after Home in the order you tick them; untick all to show Home only. Visitors switch the site between English and ಕನ್ನಡ with the (EN) / (ಕನ್ನಡ) button — the menu names switch with it.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map((category) => {
            const position = ticked.indexOf(category);
            const on = position >= 0;
            const hasStories = posted.includes(category);
            return (
              <button
                key={category}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(category)}
                className={`relative flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${
                  on ? "border-brand bg-tint" : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className={`pr-6 text-sm font-semibold leading-tight ${on ? "text-brand-strong" : "text-ink"}`}>{categoryName(category, "en")}</span>
                {!hasStories && <span className="mt-0.5 text-[11px] text-muted">No stories yet</span>}
                <span
                  aria-hidden
                  className={`absolute right-2 top-2 flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    on ? "bg-brand text-brand-contrast" : "border border-border-strong"
                  }`}
                >
                  {on ? position + 1 : <Check className="size-3 opacity-0" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
