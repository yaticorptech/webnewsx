"use client";

import { Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from "react";
import { useFieldControl } from "@/components/ui/field";
import { controlBox } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ChoiceChipProps = {
  label: ReactNode;
  selected: boolean;
  onToggle: () => void;
  /** Can't be selected right now (e.g. a list's limit is reached). Stays focusable to explain why. */
  blocked?: boolean;
  describedBy?: string;
};

/**
 * Toggle chip (a button with `aria-pressed`) for multi-select lists like languages:
 * pink outline at rest, filled crimson with a check that pops in when selected.
 */
export function ChoiceChip({ label, selected, onToggle, blocked = false, describedBy }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={blocked && !selected ? true : undefined}
      aria-describedby={describedBy}
      onClick={() => {
        if (blocked && !selected) return;
        onToggle();
      }}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-[background-color,border-color,color,transform] duration-150 ease-snap active:scale-[0.97] motion-reduce:active:scale-100",
        selected
          ? "border-brand bg-brand text-brand-contrast shadow-[0_4px_12px_-6px_rgb(227_6_19/0.6)]"
          : "border-border-strong bg-surface text-ink hover:border-brand hover:text-brand",
        blocked && !selected && "cursor-not-allowed opacity-45 hover:border-border-strong hover:text-ink",
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ width: selected ? 16 : 0, opacity: selected ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
        className="-ml-1 inline-flex overflow-hidden"
      >
        <Check className="size-4 shrink-0" strokeWidth={3} />
      </motion.span>
      {label}
    </button>
  );
}

export type ChoiceCardProps = {
  /** Shared by every card of the group (native radios: arrow keys move between them). */
  name: string;
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onSelect: () => void;
  /** Red outline while the group has an error (the <fieldset> points at the message). */
  invalid?: boolean;
};

/**
 * Radio card for a short single-choice list (the Spotlight package picker's look): white card with a
 * title + hint that turns pink with a crimson check when chosen. Put the cards in a <fieldset>.
 */
export function ChoiceCard({ name, value, label, hint, checked, onSelect, invalid }: ChoiceCardProps) {
  const id = useId();
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-200 ease-snap",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
        checked
          ? "border-brand bg-tint shadow-[0_10px_24px_-14px_rgb(227_6_19/0.55)]"
          : cn("bg-surface hover:border-tint-border hover:bg-tint", invalid ? "border-brand" : "border-border-strong"),
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-px flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          checked ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface",
        )}
      >
        {checked && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
            <Check className="size-3.5" strokeWidth={3.5} />
          </motion.span>
        )}
      </span>
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-[0.9375rem] font-bold leading-snug text-ink">
          {label}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="mt-0.5 block text-xs leading-relaxed text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export type SelectBoxProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  invalid?: boolean;
  className?: string;
  ref?: Ref<HTMLSelectElement>;
};

/** Native <select> in the same white box as `Input` (keyboard + mobile pickers for free). Wires into <Field>. */
export function SelectBox({ invalid, className, children, ref, ...props }: SelectBoxProps) {
  const field = useFieldControl({
    id: props.id,
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": invalid ?? props["aria-invalid"],
    required: props.required,
  });
  return (
    <div className={cn("relative flex h-11 w-full items-center", controlBox, className)}>
      <select
        ref={ref}
        {...props}
        {...field}
        className="h-full w-full cursor-pointer appearance-none rounded-xl bg-transparent pl-3.5 pr-10 text-[0.9375rem] font-semibold text-ink outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 size-4.5 text-muted" />
    </div>
  );
}
