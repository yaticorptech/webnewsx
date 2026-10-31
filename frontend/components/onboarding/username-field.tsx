"use client";

import { Check, CircleAlert, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode, type Ref } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { USERNAME_MAX, USERNAME_MESSAGES, sanitizeUsernameInput } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import type { UsernameStatus } from "./use-username-check";

export type UsernameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** From `useUsernameCheck(value, current)` (the parent owns the check). */
  status: UsernameStatus;
  /** A suggestion chip was picked (parent primes the cache + sets the value). */
  onPickSuggestion: (username: string) => void;
  /** Server-side error from submit (e.g. 409), shown until the value changes. */
  error?: string | null;
  label?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
};

// Word joiners (U+2060) keep "3–30" together when the hint wraps.
const RULES_HINT = "Lowercase letters, dots and underscores · 3\u2060–\u206030 characters";
const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Username input (brand bars mark as the prefix, never "@"): strips disallowed characters while typing, shows the live verdict
 * (checking → ✓ available / ✗ not available + suggestions / exact format message) in a
 * polite live region.
 */
export function UsernameField({
  value,
  onChange,
  status,
  onPickSuggestion,
  error,
  label = "Username",
  autoFocus,
  inputRef,
  className,
}: UsernameFieldProps) {
  const [stripped, setStripped] = useState(false);
  const statusId = useId();
  const inputId = `username-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const view = describe(status, stripped, error ?? null);
  const suggestions = !stripped && status.state === "unavailable" ? status.suggestions : [];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Field
        id={inputId}
        label={label}
        required
        labelAside={
          <span className={cn("tabular-nums", value.length >= USERNAME_MAX && "font-semibold text-brand")}>
            {value.length}/{USERNAME_MAX}
          </span>
        }
      >
        <Input
          ref={inputRef}
          name="username"
          prefix={<SpeedBarsSvg className="h-3.5 w-auto text-brand" />}
          value={value}
          onChange={(event) => {
            const withoutAt = event.target.value.replace(/^@+/, "");
            setStripped(/[^a-z._]/.test(withoutAt.toLowerCase()));
            onChange(sanitizeUsernameInput(withoutAt));
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={USERNAME_MAX + 5}
          placeholder="your.name"
          size="lg"
          invalid={view.tone === "error"}
          aria-describedby={statusId}
          suffix={<StatusIcon status={status} hasError={view.tone === "error"} />}
          inputClassName="font-semibold tracking-[0.01em]"
        />
      </Field>

      {/* Enter-only animation keyed by state: the verdict must never wait on an exit animation. */}
      <div id={statusId} aria-live="polite" className="min-h-5 text-[0.8125rem] leading-5">
        <motion.p
          key={view.key}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: EASE }}
          className={cn(
            "flex items-start gap-1.5",
            view.tone === "success" && "font-semibold text-success",
            view.tone === "error" && "font-semibold text-brand",
            view.tone === "muted" && "text-muted",
          )}
        >
          {view.icon}
          <span>{view.text}</span>
        </motion.p>
      </div>

      <AnimatePresence initial={false}>
        {suggestions.length > 0 && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="-mx-2 overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-0.5" role="group" aria-label="Available usernames">
              <span className="kicker text-muted">Try</span>
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, ease: EASE, delay: 0.04 * index }}
                  onClick={() => {
                    setStripped(false);
                    onPickSuggestion(suggestion);
                    document.getElementById(inputId)?.focus();
                  }}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                    className: "font-semibold normal-case",
                  })}
                >
                  <UserHandle username={suggestion} />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type View = { key: string; tone: "muted" | "success" | "error"; text: string; icon: ReactNode };

function describe(status: UsernameStatus, stripped: boolean, error: string | null): View {
  const errorIcon = <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />;
  if (error) return { key: `server:${error}`, tone: "error", text: error, icon: errorIcon };
  if (stripped) return { key: "stripped", tone: "error", text: USERNAME_MESSAGES.invalid_chars, icon: errorIcon };
  switch (status.state) {
    case "checking":
      return {
        key: "checking",
        tone: "muted",
        text: "Checking availability…",
        icon: <SpeedLinesLoader size="xs" label={null} className="mt-1 text-muted" />,
      };
    case "available":
      return {
        key: "available",
        tone: "success",
        text: status.message,
        icon: <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={3} />,
      };
    case "current":
      return {
        key: "current",
        tone: "muted",
        text: "This is your current username",
        icon: <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />,
      };
    case "unavailable":
      return { key: `unavailable:${status.message}`, tone: "error", text: status.message, icon: <X aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={3} /> };
    case "invalid":
      return { key: `invalid:${status.message}`, tone: "error", text: status.message, icon: errorIcon };
    case "error":
      return { key: "error", tone: "muted", text: status.message, icon: <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> };
    default:
      return { key: "hint", tone: "muted", text: RULES_HINT, icon: null };
  }
}

function StatusIcon({ status, hasError }: { status: UsernameStatus; hasError: boolean }) {
  let content: ReactNode = null;
  let key = "none";
  if (hasError || status.state === "unavailable" || status.state === "invalid") {
    key = "bad";
    content = (
      <span className="flex size-6 items-center justify-center rounded-full bg-brand text-brand-contrast">
        <X aria-hidden className="size-3.5" strokeWidth={3.5} />
      </span>
    );
  } else if (status.state === "checking") {
    key = "checking";
    content = <SpeedLinesLoader size="sm" label={null} />;
  } else if (status.state === "available" || status.state === "current") {
    key = "good";
    content = (
      <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
        <Check aria-hidden className="size-3.5" strokeWidth={3.5} />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex size-6 items-center justify-center">
      {content && (
        <motion.span
          key={key}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 26 }}
          className="flex"
        >
          {content}
        </motion.span>
      )}
    </span>
  );
}
