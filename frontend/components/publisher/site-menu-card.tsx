"use client";

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
        {/* As many columns as fit (the setup page's column is narrow, the site admin's wide); the badge sits beside
            the name, never on it. */}
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
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
                className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  on ? "border-brand bg-tint" : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold leading-snug ${on ? "text-brand-strong" : "text-ink"}`}>{categoryName(category, "en")}</span>
                  {!hasStories && <span className="block text-[11px] leading-snug text-muted">No stories yet</span>}
                </span>
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                    on ? "bg-brand text-brand-contrast" : "border-2 border-border-strong"
                  }`}
                >
                  {on ? position + 1 : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
