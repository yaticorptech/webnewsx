import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import { SpeedLinesLoader } from "./speed-lines-loader";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the speed-lines loader, sets aria-busy and disables the control. */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: undefined;
    ref?: Ref<HTMLButtonElement>;
  };

export type ButtonAsLink = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps | "href"> & {
    href: string;
    /** Open in a new tab with rel="noopener noreferrer" (plain <a>, no client routing). */
    external?: boolean;
    prefetch?: boolean;
    replace?: boolean;
    scroll?: boolean;
    disabled?: boolean;
    ref?: Ref<HTMLAnchorElement>;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const BASE =
  "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold font-wide " +
  "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-snap " +
  "rounded-full active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:active:scale-100";

const SIZES: Record<ButtonSize, string> = {
  // Phones: an invisible ::after grows the 32px pill to a 44px touch target (SPEC §6).
  sm: "h-8 gap-1.5 px-3.5 text-[0.8125rem] [&_svg]:size-4 max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']",
  md: "h-10 gap-2 px-5 text-sm [&_svg]:size-4.5",
  lg: "h-12 gap-2.5 px-7 text-[0.9375rem] [&_svg]:size-5",
};

/** Pill buttons from the owner's previous platform ("Open →"): crimson primary, pink secondary. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast shadow-[0_1px_2px_rgb(227_6_19/0.25)] hover:bg-brand-hover",
  secondary: "bg-tint text-brand-strong ring-1 ring-tint-border ring-inset hover:bg-surface hover:ring-brand",
  outline: "border border-border-strong bg-surface text-ink hover:border-brand hover:text-brand-strong",
  ghost: "text-ink hover:bg-surface-2",
  danger: "border border-brand bg-surface text-brand-strong hover:bg-brand hover:text-brand-contrast",
};

/** Class string for anything that should look like a Button (e.g. a <label> or menu trigger). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: Pick<BaseProps, "variant" | "size" | "fullWidth" | "className"> = {}): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && "w-full", className);
}

function Content({ loading, leftIcon, rightIcon, children }: Pick<BaseProps, "loading" | "leftIcon" | "rightIcon" | "children">) {
  return (
    <>
      {loading ? <SpeedLinesLoader size="sm" label={null} className="text-current" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );
}

/**
 * Primary actions are crimson pills (Publish, Follow, Log in). Pass `href` to render a link.
 * Icons are sized automatically; add `aria-label` when the label is visually hidden.
 */
export function Button(props: ButtonProps) {
  const { variant, size, loading = false, leftIcon, rightIcon, fullWidth, className, children } = props;
  const classes = buttonClasses({ variant, size, fullWidth, className });
  const content = (
    <Content loading={loading} leftIcon={leftIcon} rightIcon={rightIcon}>
      {children}
    </Content>
  );

  if (props.href !== undefined) {
    const {
      href,
      external,
      prefetch,
      replace,
      scroll,
      disabled,
      variant: _v,
      size: _s,
      loading: _l,
      leftIcon: _li,
      rightIcon: _ri,
      fullWidth: _f,
      className: _c,
      children: _ch,
      ...anchorProps
    } = props;
    const inactive = disabled || loading;
    const shared = {
      ...anchorProps,
      className: classes,
      "aria-disabled": inactive || undefined,
      "aria-busy": loading || undefined,
      tabIndex: inactive ? -1 : anchorProps.tabIndex,
    };
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...shared}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} replace={replace} scroll={scroll} {...shared}>
        {content}
      </Link>
    );
  }

  const {
    type = "button",
    disabled,
    variant: _v,
    size: _s,
    loading: _l,
    leftIcon: _li,
    rightIcon: _ri,
    fullWidth: _f,
    className: _c,
    children: _ch,
    href: _h,
    ...buttonProps
  } = props;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
