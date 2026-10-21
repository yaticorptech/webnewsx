"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/*
 * Dense desk tables that become cards on phones: one DOM (no duplicated controls), a real <table>
 * from 768px, and below that every row is a white card whose cells stack. Explicit ARIA roles keep
 * the table semantics when the phone layout switches the elements to block/grid display.
 */

export function Table({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    // No overflow clipping: row menus open below the last row. Columns are sized to fit (phones get cards).
    <div className={cn("md:card", className)}>
      <table role="table" className="w-full border-collapse text-left text-sm max-md:block">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead role="rowgroup" className="max-md:sr-only">
      <tr role="row" className="border-b border-border">
        {children}
      </tr>
    </thead>
  );
}

export function Th({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      role="columnheader"
      scope="col"
      className={cn(
        "kicker whitespace-nowrap bg-surface-2/70 px-4 py-3 text-left font-bold text-muted first:rounded-tl-2xl first:pl-5 last:rounded-tr-2xl last:pr-5",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody role="rowgroup" className="max-md:flex max-md:flex-col max-md:gap-3">
      {children}
    </tbody>
  );
}

type TrProps = HTMLMotionProps<"tr"> & {
  /** Emphasise the row (e.g. selected, just changed). */
  highlight?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
};

export function Tr({ children, className, highlight, index = 0, ...props }: TrProps) {
  return (
    <motion.tr
      role="row"
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.28, delay: Math.min(index, 10) * 0.03, ease: [0.2, 0.8, 0.2, 1] } }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      className={cn(
        "border-b border-border align-middle transition-colors last:border-0 md:hover:bg-tint/60",
        // Phones: a card whose cells flow in a wrapping row (give a cell `max-md:basis-full` for its own line).
        "max-md:card max-md:flex max-md:min-w-0 max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2.5 max-md:p-4",
        highlight && "bg-tint/70",
        className,
      )}
      {...props}
    >
      {children}
    </motion.tr>
  );
}

type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** Small caption shown before the value on phones (the column header is hidden there). */
  label?: string;
};

export function Td({ children, className, label, ...props }: TdProps) {
  return (
    <td role="cell" className={cn("px-4 py-3 max-md:block max-md:min-w-0 max-md:max-w-full max-md:p-0 md:first:pl-5 md:last:pr-5", className)} {...props}>
      {label ? (
        <span className="flex items-center gap-2 max-md:justify-between">
          <span className="kicker text-muted md:hidden">{label}</span>
          <span className="min-w-0">{children}</span>
        </span>
      ) : (
        children
      )}
    </td>
  );
}
