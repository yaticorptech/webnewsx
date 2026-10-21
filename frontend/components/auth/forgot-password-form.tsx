"use client";

import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { looksLikeEmail, mapAuthError } from "./auth-errors";
import { FormAlert } from "./form-bits";

/**
 * "Forgot password?" (owner 2026-09-29): asks the API to email a one-time reset link (backend auth.ts). The answer is
 * the same whether or not the address has an account, so the page never tells: "if there's an account, a link is on
 * its way". The link opens /reset-password.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const value = email.trim();
    const problem = !value ? "Enter your email address." : !looksLikeEmail(value) ? "Enter a valid email address." : null;
    setError(problem);
    setFormError(null);
    if (problem) {
      emailRef.current?.focus();
      return;
    }
    setPending(true);
    const { error: apiError } = await authClient.requestPasswordReset({ email: value, redirectTo: "/reset-password" });
    setPending(false);
    if (apiError) {
      const mapped = mapAuthError(apiError, "We couldn't send the link. Please try again.");
      if (mapped.field === "email") {
        setError(mapped.message);
        emailRef.current?.focus();
      } else setFormError(mapped.message);
      return;
    }
    setSentTo(value);
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-tint-border bg-tint p-4 text-sm leading-relaxed text-ink">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            If there&apos;s a WebNEWS account for <strong className="font-bold wrap-anywhere">{sentTo}</strong>, we&apos;ve
            emailed it a link to choose a new password. It works for 60 minutes. Can&apos;t find it? Check your spam folder.
          </p>
        </div>
        <Button variant="secondary" size="lg" fullWidth onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
        <BackToLogin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Reset your password">
        <FormAlert message={formError} />
        <Field label="Email" error={error ?? undefined}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            size="lg"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
          Send reset link
        </Button>
      </form>
      <BackToLogin />
    </div>
  );
}

export function BackToLogin() {
  return (
    <p className="text-center text-sm text-muted">
      <Link href="/login" className="inline-flex items-center gap-1.5 font-bold text-brand underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Back to log in
      </Link>
    </p>
  );
}
