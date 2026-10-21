"use client";

import { motion } from "motion/react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label (clickable). May contain links. */
  label?: ReactNode;
  invalid?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Native checkbox (keyboard, forms, a11y) with a branded box and an animated check stroke. */
export function Checkbox({ checked, onCheckedChange, label, invalid, className, disabled, ref, ...props }: CheckboxProps) {
  const field = useFieldControl({
    id: props.id,
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": invalid ?? props["aria-invalid"],
    required: props.required,
  });
  return (
    <label className={cn("group inline-flex cursor-pointer items-start gap-3 text-sm leading-snug", disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          {...props}
          {...field}
          className="peer absolute inset-0 size-full cursor-[inherit] appearance-none rounded-[5px] border-[1.5px] border-border-strong bg-surface transition-colors duration-150 checked:border-brand checked:bg-brand hover:border-brand aria-invalid:border-brand"
        />
        <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none relative size-full text-brand-contrast">
          <motion.path
            d="M5 10.5l3.2 3.2L15 7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </svg>
      </span>
      {label && <span className="text-ink-2">{label}</span>}
    </label>
  );
}
