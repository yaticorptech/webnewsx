import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type UserHandleProps = {
  username: string;
  /** Let long handles wrap after a dot ("night.<wbr>desk") instead of mid-word. */
  wrap?: boolean;
  /** Cut the handle with an ellipsis when its container runs out of room (the "@" and the start always stay). */
  truncate?: boolean;
  className?: string;
};

/**
 * A WebNEWS handle: "@username" (owner 2026-09-25: back to the classic "@", replacing the brand-bars mark used since
 * 2026-09-24). One text run, so it reads (and is announced) as "@username" — never "@ username".
 */
export function UserHandle({ username, wrap = false, truncate = false, className }: UserHandleProps) {
  const name = username.replace(/^@+/, "");
  return (
    <span data-handle={name} className={cn("inline-flex max-w-full min-w-0 items-baseline", !wrap && "whitespace-nowrap", className)}>
      <span className={cn("min-w-0", wrap && "wrap-anywhere", truncate && "truncate")}>@{wrap ? withDotBreaks(name) : name}</span>
    </span>
  );
}

/** Plain-text form for titles, aria-labels, share text and other string-only places: "@username". */
export function handleText(username: string): string {
  return `@${username.replace(/^@+/, "")}`;
}

function withDotBreaks(username: string): ReactNode[] {
  return username
    .split(".")
    .flatMap((part, i) => (i === 0 ? [part] : [<Fragment key={i}>.<wbr /></Fragment>, part]));
}
