"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  /** Fixed leading content inside the box (e.g. the brand bars mark before a username). */
  prefix?: ReactNode;
  /** Trailing content inside the box (status icon, button). */
  suffix?: ReactNode;
  size?: "md" | "lg";
  invalid?: boolean;
  /** Classes for the outer box (the <input> gets `inputClassName`). */
  className?: string;
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Shared box styles for inputs/textareas: white box, grey rule, crimson focus with a pink halo. */
export const controlBox =
  "rounded-xl border border-border-strong bg-surface text-ink transition-[border-color,box-shadow] duration-150 " +
  "hover:border-muted-2 focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)] " +
  "has-disabled:opacity-60 has-aria-invalid:border-brand";

export function Input({ prefix, suffix, size = "md", invalid, className, inputClassName, ref, ...props }: InputProps) {
  const field = useFieldControl({
    id: props.id,
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": invalid ?? props["aria-invalid"],
    required: props.required,
  });
  return (
    <div className={cn("flex w-full items-center", controlBox, size === "lg" ? "h-12" : "h-11", className)}>
      {prefix && (
        <span aria-hidden className="pl-3.5 font-bold text-muted select-none">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        {...props}
        {...field}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent px-3.5 text-[0.9375rem] outline-none",
          prefix ? "pl-1" : undefined,
          suffix ? "pr-2" : undefined,
          inputClassName,
        )}
      />
      {suffix && <span className="flex shrink-0 items-center pr-3">{suffix}</span>}
    </div>
  );
}
