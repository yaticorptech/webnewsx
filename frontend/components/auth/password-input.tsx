"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";

export type PasswordInputProps = Omit<InputProps, "type" | "suffix">;

/** Password input with a show/hide toggle (keeps the caret; the toggle is a real button). */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="relative -mr-1.5 inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink max-md:after:absolute max-md:after:-inset-1 max-md:after:content-['']"
        >
          {visible ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        </button>
      }
    />
  );
}
