"use client";

import { CircleAlert } from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { SelectBox } from "@/components/presspass/form-controls";
import { NAV_MAIN, NAV_MORE } from "@/lib/categories";
import { CATEGORY_LABELS, DISTRICT_CATEGORY, KARNATAKA_DISTRICTS, LIMITS, isCategory, type Category } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/* ─────────────────────────── Section frame ─────────────────────────── */

export type SectionProps = {
  id: string;
  /** The section's caption. */
  label: ReactNode;
  /** Associates the label with a native control (`<label for>`); otherwise it's a plain caption. */
  htmlFor?: string;
  required?: boolean;
  /** Show the "*" / "(optional)" marker (default). Off for a choice that always holds a value. */
  marker?: boolean;
  aside?: ReactNode;
  /** A short line under the label: what goes here. */
  hint?: ReactNode;
  error?: string;
  /** Increments whenever validation runs, replaying the nudge on invalid sections. */
  flash?: number;
  children: ReactNode;
};

/**
 * Labelled composer block: kicker label with the speed-lines glyph, optional aside (counter), the
 * control and an aria-live error line. Invalid sections get a red rule and a short nudge.
 */
export function Section({ id, label, htmlFor, required, marker = true, aside, hint, error, flash = 0, children }: SectionProps) {
  const [scope, animate] = useAnimate<HTMLElement>();
  const lastFlash = useRef(flash);

  useEffect(() => {
    if (flash === lastFlash.current) return;
    lastFlash.current = flash;
    if (error && scope.current)
      void animate(scope.current, { x: [0, -7, 6, -4, 3, 0] }, { duration: 0.42, ease: "easeOut" });
  }, [flash, error, animate, scope]);

  const Label = htmlFor ? "label" : "p";
  return (
    <section ref={scope} aria-labelledby={`${id}-label`} className="relative flex scroll-mt-nav flex-col gap-1.5 sm:gap-2">
      <AnimatePresence>
        {error && (
          <motion.span
            aria-hidden
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute -left-3 top-0 bottom-0 w-0.75 origin-top bg-brand sm:-left-5"
          />
        )}
      </AnimatePresence>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          {/* Field headings stand out (owner 2026-10-15): brand red, a touch larger than a plain kicker. */}
          <Label id={`${id}-label`} {...(htmlFor ? { htmlFor } : {})} className="kicker flex items-center gap-2 text-[0.75rem] text-brand">
            <SpeedLines className="text-[0.8rem]" tone="brand" />
            {label}
            {!marker ? null : required ? (
              <span aria-hidden className="text-brand">
                *
              </span>
            ) : (
              <span className="font-semibold normal-case tracking-normal text-faint">(optional)</span>
            )}
          </Label>
          {hint && <p className="text-[0.8125rem] text-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
      {/* Empty: cancels the gap above, so a field without an error leaves no blank line. */}
      <div aria-live="polite" className="empty:-mt-1.5 sm:empty:-mt-2">
        {error && (
          <p
            id={`${id}-error`}
            className="flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-relaxed text-brand"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/** "42 / 150" counter that turns red near the limit (`overOnly`: only once past it — a soft limit). */
export function Counter({ value, max, label, overOnly = false }: { value: number; max: number; label: string; overOnly?: boolean }) {
  const near = overOnly ? value > max : value >= max * 0.9;
  return (
    <span className={cn("shrink-0 whitespace-nowrap text-xs tabular-nums", near ? "font-bold text-brand" : "text-muted")}>
      <span className="sr-only">{label}: </span>
      {value} / {max}
    </span>
  );
}

/* ─────────────────────────── Headline ─────────────────────────── */

/** The headline's target length (owner 2026-10-15): longer is allowed, but everything past it shows in red. */
export const TITLE_SOFT_MAX = 75;

export type TitleInputProps = {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  /** Enter moves on to the story instead of inserting a newline. */
  onEnter: () => void;
};

/**
 * Single-line headline that wraps like print: big, wide, heavy, auto-growing — in a tinted box that reads as a field
 * (owner 2026-10-08) and turns white with a red ring while typing; a click anywhere in the box puts the caret in.
 */
export function TitleInput({ value, onChange, invalid, describedBy, onEnter }: TitleInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow (fallback for browsers without `field-sizing: content`).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onEnter();
    }
  };

  return (
    <div
      onClick={() => ref.current?.focus()}
      className={cn(
        // Compact (owner 2026-10-08: "make it small"): a normal-sized field, not a banner.
        "cursor-text rounded-xl border-[1.5px] px-3.5 py-2.5 transition-[border-color,background-color,box-shadow] duration-150 sm:px-4 sm:py-3",
        invalid
          ? "border-brand bg-tint"
          : "border-tint-border bg-tint/60 hover:border-brand/60 hover:bg-tint-2",
        "focus-within:border-brand focus-within:bg-surface focus-within:shadow-[0_0_0_3px_var(--brand-soft)] focus-within:hover:bg-surface",
      )}
    >
      {/* The text is drawn by the mirror under the (transparent) textarea, so the characters past TITLE_SOFT_MAX can be red. */}
      {/* One column that never grows past the box (a long word used to push the grid — and the text — out of it). */}
      <div className="grid grid-cols-[minmax(0,1fr)]">
      <div
        aria-hidden
        dir="auto"
        className="pointer-events-none min-w-0 whitespace-pre-wrap font-wide [overflow-wrap:anywhere] text-lg font-extrabold leading-[1.2] tracking-[-0.01em] text-ink [grid-area:1/1] sm:text-xl"
      >
        {value.slice(0, TITLE_SOFT_MAX)}
        {value.length > TITLE_SOFT_MAX && <span className="text-brand underline decoration-brand/50 decoration-wavy underline-offset-4">{value.slice(TITLE_SOFT_MAX)}</span>}
        {/* Keeps a trailing space's width, like the textarea. */}
        {"\u200b"}
      </div>
      <textarea
        ref={ref}
        id="composer-title"
        rows={1}
        value={value}
        maxLength={LIMITS.titleMax}
        onChange={(event) => onChange(event.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
        onKeyDown={onKeyDown}
        dir="auto"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required
        autoComplete="off"
        spellCheck
        className={cn(
          "block min-h-[1.2em] w-full min-w-0 max-w-full resize-none overflow-hidden whitespace-pre-wrap bg-transparent [overflow-wrap:anywhere] font-wide text-lg font-extrabold leading-[1.2] tracking-[-0.01em] text-transparent caret-ink outline-none field-sizing-content [grid-area:1/1] selection:bg-brand/20 sm:text-xl",
          // The placeholder reads as a prompt, not as a headline already typed (owner 2026-10-08: "confusing"): smaller,
          // regular weight, light grey.
          "placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-2 sm:placeholder:text-lg",
          "focus-visible:outline-none",
        )}
      />
      </div>
    </div>
  );
}

/* ─────────────────────────── Category ─────────────────────────── */

/** The nav's sections in the nav's order (Trending isn't a category: it's the automatic most-read list). */
const MAIN_CATEGORIES = NAV_MAIN.map((item) => item.key).filter(isCategory);
const MORE_CATEGORIES = NAV_MORE.map((item) => item.key).filter(isCategory);

export type CategoryPickerProps = {
  category: Category | "";
  district: string;
  onCategoryChange: (category: Category | "") => void;
  onDistrictChange: (district: string) => void;
  categoryInvalid: boolean;
  districtInvalid: boolean;
  describedBy?: string;
  /** Element ids: `<prefix>-category` and `<prefix>-district` (the composer's own by default). */
  idPrefix?: string;
};

/**
 * One category per story — the sections of the category nav (grouped like the nav: main row, then More).
 * Karnataka stories also pick their district, which files them under that district's page too.
 */
export function CategoryPicker({
  category,
  district,
  onCategoryChange,
  onDistrictChange,
  categoryInvalid,
  districtInvalid,
  describedBy,
  idPrefix = "composer",
  categoryOnly = false,
}: CategoryPickerProps & {
  /** The composer (owner 2026-10-14) shows the district in its own "Sub category" field beside this one. */
  categoryOnly?: boolean;
}) {
  const needsDistrict = !categoryOnly && category === DISTRICT_CATEGORY;
  return (
    <div className={cn("grid gap-3", !categoryOnly && "sm:grid-cols-2")}>
      <SelectBox
        id={`${idPrefix}-category`}
        value={category}
        invalid={categoryInvalid}
        aria-describedby={describedBy}
        aria-required
        onChange={(event) => onCategoryChange(isCategory(event.target.value) ? event.target.value : "")}
        className="h-12"
      >
        <option value="" disabled>
          Choose a category
        </option>
        <optgroup label="Sections">
          {MAIN_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </optgroup>
        <optgroup label="More">
          {MORE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </optgroup>
      </SelectBox>
      <AnimatePresence initial={false}>
        {needsDistrict && (
          <motion.div
            key="district"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <SelectBox
              id={`${idPrefix}-district`}
              aria-label="District"
              value={district}
              invalid={districtInvalid}
              aria-describedby={describedBy}
              aria-required
              onChange={(event) => onDistrictChange(event.target.value)}
              className="h-12"
            >
              <option value="" disabled>
                Choose the district
              </option>
              {KARNATAKA_DISTRICTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectBox>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
