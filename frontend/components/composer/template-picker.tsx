"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { POSTER_TEMPLATES, StoryPoster, type PosterStory } from "@/components/poster/story-poster";
import type { PosterTemplate } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type TemplatePickerProps = {
  /** The chosen design ("" = none yet: nothing is preselected, the reporter picks one). */
  value: PosterTemplate | "";
  onChange: (value: PosterTemplate) => void;
  /** The reporter's own story as it stands (`previewPosterStory`): every thumbnail shows it. */
  story: PosterStory;
  /** Id of the radio group (its hint is `<id>-hint`). Focusing the field means focusing its chosen (or first) radio. */
  id?: string;
  /** Id of the caption that names the group (the Section's label). */
  labelledBy?: string;
  describedBy?: string;
  /** Red rings while the group has an error (none chosen on publish, or the API rejected the value). */
  invalid?: boolean;
};

/** Every design but the reporter's own (owner 2026-10-16: that tile is gone — the row starts at "No template"). */
const DESIGNS = POSTER_TEMPLATES.filter((template) => template.value !== "own-frame");

/**
 * The reel poster picker: the designs as small live posters of the reporter's own photo, headline and byline, in ONE
 * row that scrolls sideways at every width (owner 2026-10-08: "not all in a list"; arrows on wider screens). Native radios (visually hidden) carry the choice, so arrow
 * keys move between them; the chosen poster gets a red ring and a check, and the hint under the row describes it.
 */
export function TemplatePicker({
  value,
  onChange,
  story,
  id = "composer-template",
  labelledBy,
  describedBy,
  invalid = false,
}: TemplatePickerProps) {
  const uid = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  // Keep the chosen poster in view — a draft reopened on "Slant", a restored autosave, or a tap on a half-visible
  // poster. Only the row scrolls, never the page. Arrow keys already scroll via focus.
  useEffect(() => {
    if (!value) return;
    const row = rowRef.current;
    const option = row?.querySelector<HTMLElement>(`[data-template="${value}"]`);
    if (!row || !option || row.scrollWidth <= row.clientWidth) return;
    const start = option.offsetLeft - row.scrollLeft;
    if (start >= 0 && start + option.offsetWidth <= row.clientWidth) return;
    row.scrollTo({ left: option.offsetLeft - (row.clientWidth - option.offsetWidth) / 2, behavior: "smooth" });
  }, [value]);

  const scrollRow = (direction: -1 | 1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: "smooth" });
  };

  const option = (template: (typeof POSTER_TEMPLATES)[number], extra?: ReactNode) => {
    const checked = template.value === value;
    return (
      <label
        key={template.value}
        data-template={template.value}
        className="group relative flex w-30 shrink-0 cursor-pointer snap-start flex-col gap-2 sm:w-34 lg:w-36"
      >
        <input
          type="radio"
          name={`${id}-choice`}
          value={template.value}
          checked={checked}
          onChange={() => onChange(template.value)}
          aria-labelledby={`${uid}-${template.value}-label`}
          aria-describedby={`${uid}-${template.value}-hint`}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "relative block rounded-[0.625rem] transition-[transform,box-shadow] duration-200 ease-snap",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand",
            checked
              ? "ring-[2.5px] ring-brand shadow-[0_12px_24px_-14px_rgb(227_6_19/0.7)]"
              : cn(
                  "group-hover:-translate-y-0.5 group-hover:shadow-card",
                  invalid ? "ring-2 ring-brand/60" : "ring-1 ring-border group-hover:ring-tint-border",
                ),
          )}
        >
          <StoryPoster template={template.value} story={story} className="rounded-[0.625rem]" />
          {checked && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 20 }}
              className="absolute -right-1.5 -top-1.5 flex size-5.5 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_0_0_2px_var(--surface)]"
            >
              <Check className="size-3.5" strokeWidth={3.5} />
            </motion.span>
          )}
        </span>
        {extra}
        <span
          id={`${uid}-${template.value}-label`}
          className={cn(
            "truncate text-center text-xs font-bold transition-colors duration-150",
            checked ? "text-brand" : "text-ink-2 group-hover:text-ink",
          )}
        >
          {template.label}
        </span>
        <span id={`${uid}-${template.value}-hint`} className="sr-only">
          {template.description}
          {template.fitsTall ? " Fits a tall 9:16 photo in full." : ""}
        </span>
      </label>
    );
  };

  return (
    <>
      <div className="relative">
        <div
          ref={rowRef}
          id={id}
          role="radiogroup"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-required
          aria-invalid={invalid || undefined}
          // py-2 (cancelled by -my-2) keeps the focus outline and the check badge clear of the row's scroll clipping.
          className="no-scrollbar relative -mx-4 -my-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 sm:mx-0 sm:scroll-px-1 sm:px-1"
        >
          {/* Starts at "No template" (owner 2026-10-16: the own-template tile was removed). */}
          {DESIGNS.map((template) => option(template))}
        </div>

        {/* Wider screens: arrows to page through the row (phones swipe it). */}
        <button
          type="button"
          aria-label="Earlier templates"
          onClick={() => scrollRow(-1)}
          className="absolute -left-4 top-[42%] z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card transition-colors hover:border-brand hover:text-brand sm:inline-flex"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="More templates"
          onClick={() => scrollRow(1)}
          className="absolute -right-4 top-[42%] z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card transition-colors hover:border-brand hover:text-brand sm:inline-flex"
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </>
  );
}
