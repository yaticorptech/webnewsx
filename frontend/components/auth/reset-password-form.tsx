"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { WEAK_PASSWORD_MESSAGE, isPasswordStrongEnough } from "@/lib/shared/contracts";
import { PASSWORD_MAX, PASSWORD_MIN, mapAuthError } from "./auth-errors";
import { BackToLogin } from "./forgot-password-form";
import { FormAlert } from "./form-bits";
import { PasswordInput } from "./password-input";
import { PasswordStrengthMeter } from "./password-strength";

type Errors = { password?: string; confirm?: string };

/**
 * The page a reset email's link opens (owner 2026-09-29): a new password (the sign-up strength rule, checked again by
 * the API) twice. Success signs the account out everywhere (backend auth.ts) and goes to /login with a notice.
 * A used or expired link (Better Auth: INVALID_TOKEN) offers a new one.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const meterId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found: Errors = {};
    if (!password) found.password = "Choose a new password.";
    else if (password.length < PASSWORD_MIN) found.password = `Use at least ${PASSWORD_MIN} characters.`;
    else if (password.length > PASSWORD_MAX) found.password = `Use at most ${PASSWORD_MAX} characters.`;
    else if (!isPasswordStrongEnough(password, [])) found.password = WEAK_PASSWORD_MESSAGE;
    if (!confirm) found.confirm = "Confirm your new password.";
    else if (confirm !== password) found.confirm = "Passwords don't match.";
    setErrors(found);
    setFormError(null);
    if (found.password || found.confirm) {
      (found.password ? passwordRef : confirmRef).current?.focus();
      return;
    }

    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setPending(false);
      if (error.code === "INVALID_TOKEN") {
        setExpired(true);
        return;
      }
      const mapped = mapAuthError(error, "We couldn't change your password. Please try again.");
      if (mapped.field === "password") {
        setErrors({ password: mapped.message });
        passwordRef.current?.focus();
      } else setFormError(mapped.message);
      return;
    }
    router.replace("/login?reset=1");
  };

  if (expired) return <ExpiredLink />;

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Choose a new password">
        <FormAlert message={formError} />
        <Field label="New password" error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            name="new-password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN} characters`}
            maxLength={PASSWORD_MAX}
            aria-describedby={meterId}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            size="lg"
          />
        </Field>
        <PasswordStrengthMeter id={meterId} value={password} className="-mt-1" />
        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput
            ref={confirmRef}
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
            }}
            size="lg"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
          Save new password
        </Button>
      </form>
      <BackToLogin />
    </div>
  );
}

/** A used, expired or broken reset link. */
export function ExpiredLink() {
  return (
    <div className="flex flex-col gap-6">
      <FormAlert message="This reset link has expired or was already used. Ask for a new one — it only takes a moment." />
      <Button href="/forgot-password" size="lg" fullWidth>
        Send a new link
      </Button>
      <BackToLogin />
    </div>
  );
}
