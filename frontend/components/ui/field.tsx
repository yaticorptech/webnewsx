"use client";

import { CircleAlert } from "lucide-react";
import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldContextValue = {
  id: string;
  hintId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  hasHint: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export type FieldProps = {
  label: ReactNode;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Error message; marks the control aria-invalid and links it via aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  /** Content aligned right of the label (e.g. a counter or link). */
  labelAside?: ReactNode;
  /** Explicit control id (otherwise generated). */
  id?: string;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Label + control + hint/error with ARIA wiring. Input, Textarea and Checkbox placed inside
 * pick up `id`, `aria-describedby`, `aria-invalid` and `required` automatically.
 */
export function Field({ label, hint, error, required = false, labelAside, id, hideLabel, className, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const value: FieldContextValue = {
    id: controlId,
    hintId: `${controlId}-hint`,
    errorId: `${controlId}-error`,
    invalid: Boolean(error),
    required,
    hasHint: Boolean(hint),
  };

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className={cn("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
          <label htmlFor={controlId} className="text-[0.8125rem] font-bold tracking-[0.01em] text-ink">
            {label}
            {required && (
              <span aria-hidden className="ml-0.5 text-brand-strong">
                *
              </span>
            )}
          </label>
          {labelAside && <div className="text-xs text-muted">{labelAside}</div>}
        </div>
        {children}
        {hint && !error && (
          <p id={value.hintId} className="text-xs leading-relaxed text-muted">
            {hint}
          </p>
        )}
        <div aria-live="polite">
          {error && (
            <p id={value.errorId} className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-brand-strong">
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </FieldContext.Provider>
  );
}

/** Props a form control should spread when rendered inside <Field>. */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  required?: boolean;
}) {
  const field = useContext(FieldContext);
  if (!field) {
    return { id: props.id, "aria-describedby": props["aria-describedby"], "aria-invalid": props["aria-invalid"], required: props.required };
  }
  const describedBy =
    [props["aria-describedby"], field.invalid ? field.errorId : field.hasHint ? field.hintId : null].filter(Boolean).join(" ") ||
    undefined;
  return {
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    required: props.required ?? (field.required || undefined),
  };
}
