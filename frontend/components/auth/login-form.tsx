"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GoogleButton, useGoogleSignIn } from "@/components/ui/google-button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { ADMIN_HOME } from "@/lib/admin-home";
import { signIn } from "@/lib/auth-client";
import { looksLikeEmail, mapAuthError } from "./auth-errors";
import { FormAlert, OrDivider } from "./form-bits";
import { withNext } from "./next-path";
import { PasswordInput } from "./password-input";
import { markSignedIn, markWelcomeBack } from "./signed-in-flag";

type Errors = { email?: string; password?: string };

/**
 * Email + password log-in (Better Auth). Success → /onboarding when the profile isn't finished, the Editor Desk
 * for an admin (the only way into it: owner rule, backend lib/desk-sign-in.ts), otherwise `next` (or "/").
 * The root layout re-reads the viewer via router.refresh(). `initialError` = why Google sent the visitor back;
 * `notice` = good news to show above the form (e.g. the password was just reset).
 */
export function LoginForm({
  next,
  initialError = null,
  notice = null,
}: {
  next: string | null;
  initialError?: string | null;
  notice?: string | null;
}) {
  const google = useGoogleSignIn();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const validate = (): Errors => {
    const found: Errors = {};
    if (!email.trim()) found.email = "Enter your email address.";
    else if (!looksLikeEmail(email)) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    return found;
  };

  // Good news from the last step (e.g. the password was just reset), as an alert card (owner 2026-10-08).
  useEffect(() => {
    if (notice) toast.success("Password changed", { id: "login-notice", description: notice });
  }, [notice]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setPending(true);
    const { error } = await signIn.email({ email: email.trim(), password, rememberMe: true });
    if (error) {
      const mapped = mapAuthError(error, "We couldn't log you in. Please try again.");
      if (mapped.field) {
        setErrors({ [mapped.field]: mapped.message });
        (mapped.field === "email" ? emailRef : passwordRef).current?.focus();
      } else {
        setFormError(mapped.message);
        passwordRef.current?.select();
      }
      setPending(false);
      return;
    }

    let destination = next ?? "/";
    try {
      const { viewer } = await api.me();
      if (viewer && (!viewer.onboarded || !viewer.username)) destination = withNext("/onboarding", next);
      else if (viewer?.role === "admin") destination = ADMIN_HOME;
    } catch {
      // The destination's server-side gate still routes unfinished profiles to /onboarding.
    }
    markSignedIn();
    if (destination !== ADMIN_HOME) markWelcomeBack();
    queryClient.clear();
    router.replace(destination);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {google && (
        <>
          <GoogleButton callbackURL={next ?? "/"} newUserCallbackURL={withNext("/onboarding", next)} />
          <OrDivider label="or log in with email" />
        </>
      )}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Log in with email">
        <FormAlert message={formError} />
        <Field label="Email" error={errors.email}>
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
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            size="lg"
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            size="lg"
          />
        </Field>
        <Link
          href="/forgot-password"
          className="-mt-1 self-end rounded-sm text-sm font-bold text-brand underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <Button type="submit" size="lg" fullWidth loading={pending} rightIcon={<ArrowRight aria-hidden />} className="mt-2">
          Log in
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        New to WebNEWS?{" "}
        <Link href={withNext("/signup", next)} className="font-bold text-brand underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
