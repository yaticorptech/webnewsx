import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export type IconButtonVariant = "ghost" | "outline" | "solid" | "brand";
export type IconButtonSize = "sm" | "md" | "lg";

type Common = {
  /** Accessible name (required — the button has no visible text). Also used as the tooltip title. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: "square" | "circle";
  /** Toggle state → aria-pressed (like, bookmark…). */
  pressed?: boolean;
  className?: string;
  children: ReactNode;
};

export type IconButtonProps =
  | (Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common | "aria-label"> & { href?: undefined; ref?: Ref<HTMLButtonElement> })
  | (Common & { href: string; prefetch?: boolean; ref?: Ref<HTMLAnchorElement> });

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-10 [&_svg]:size-5",
  lg: "size-11 [&_svg]:size-5.5",
};

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-ink hover:bg-surface-2",
  outline: "border border-border bg-surface text-ink hover:border-brand hover:text-brand-strong",
  solid: "bg-surface-2 text-ink hover:bg-tint-2 hover:text-brand-strong",
  brand: "bg-brand text-brand-contrast hover:bg-brand-hover",
};

export function iconButtonClasses({
  variant = "ghost",
  size = "md",
  shape = "circle",
  className,
}: Pick<Common, "variant" | "size" | "shape" | "className"> = {}): string {
  return cn(
    "relative inline-flex shrink-0 items-center justify-center transition-[color,background-color,border-color,transform] duration-150 ease-snap",
    "active:scale-90 disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100",
    // Invisible hit-area expansion toward 44px touch targets.
    "after:absolute after:-inset-1 after:content-['']",
    shape === "circle" ? "rounded-full" : "rounded-xl",
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}

/** Square/round icon-only control with a required accessible label. */
export function IconButton(props: IconButtonProps) {
  const { label, variant, size, shape, pressed, className, children } = props;
  const classes = iconButtonClasses({ variant, size, shape, className });

  if (props.href !== undefined) {
    const { href, prefetch, ref } = props;
    return (
      <Link href={href} prefetch={prefetch} aria-label={label} title={label} className={classes} ref={ref}>
        {children}
      </Link>
    );
  }

  const {
    label: _l,
    variant: _v,
    size: _s,
    shape: _sh,
    pressed: _p,
    className: _c,
    children: _ch,
    href: _h,
    type = "button",
    ...rest
  } = props;
  return (
    <button type={type} aria-label={label} title={label} aria-pressed={pressed} className={classes} {...rest}>
      {children}
    </button>
  );
}
