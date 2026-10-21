"use client";

import { useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { controlBox } from "./input";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Show "n / maxLength" under the box (default: true when maxLength is set). */
  showCount?: boolean;
  /** Grow with content up to `maxRows`. */
  autoGrow?: boolean;
  maxRows?: number;
  invalid?: boolean;
  /** Classes for the outer box. */
  className?: string;
  textareaClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({
  showCount,
  autoGrow = false,
  maxRows = 12,
  invalid,
  className,
  textareaClassName,
  maxLength,
  rows = 3,
  ref,
  ...props
}: TextareaProps) {
  const field = useFieldControl({
    id: props.id,
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": invalid ?? props["aria-invalid"],
    required: props.required,
  });
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const length = typeof props.value === "string" ? props.value.length : typeof props.defaultValue === "string" ? props.defaultValue.length : 0;
  const counterVisible = (showCount ?? maxLength !== undefined) && maxLength !== undefined;
  const nearLimit = maxLength !== undefined && length >= maxLength * 0.9;

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!autoGrow || !el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * maxRows + 24)}px`;
  }, [autoGrow, maxRows, props.value]);

  const setRefs = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <div className={cn("flex w-full", controlBox, className)}>
        <textarea
          ref={setRefs}
          rows={rows}
          maxLength={maxLength}
          {...props}
          {...field}
          className={cn(
            "min-h-22 w-full resize-none bg-transparent px-3.5 py-3 text-[0.9375rem] leading-relaxed outline-none",
            textareaClassName,
          )}
        />
      </div>
      {counterVisible && (
        <p className={cn("self-end text-xs tabular-nums", nearLimit ? "font-semibold text-brand-strong" : "text-muted")}>
          <span className="sr-only">Characters used: </span>
          {length} / {maxLength}
        </p>
      )}
    </div>
  );
}
