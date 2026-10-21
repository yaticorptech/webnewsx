"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GoogleButton, useGoogleSignIn } from "@/components/ui/google-button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { WEAK_PASSWORD_MESSAGE, emailWords, isPasswordStrongEnough } from "@/lib/shared/contracts";
import { PASSWORD_MAX, PASSWORD_MIN, looksLikeEmail, mapAuthError } from "./auth-errors";
import { FormAlert, OrDivider } from "./form-bits";
import { withNext } from "./next-path";
import { PasswordInput } from "./password-input";
import { PasswordStrengthMeter } from "./password-strength";
import { markSignedIn } from "./signed-in-flag";

type FieldName = "email" | "password" | "confirm";
type Errors = Partial<Record<FieldName, string>>;

/**
 * Email sign-up (Better Auth, auto sign-in). Display name, username, photo, bio and Terms are
 * collected by onboarding, so success always continues to /onboarding.
 */
export function SignupForm({ next }: { next: string | null }) {
  const google = useGoogleSignIn();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const focusField = (name: FieldName) => ({ email: emailRef, password: passwordRef, confirm: confirmRef })[name].current?.focus();
  const meterId = useId();

  const validate = (): Errors => {
    const found: Errors = {};
    if (!email.trim()) found.email = "Enter your email address.";
    else if (!looksLikeEmail(email)) found.email = "Enter a valid email address.";
    if (!password) found.password = "Choose a password.";
    else if (password.length < PASSWORD_MIN) found.password = `Use at least ${PASSWORD_MIN} characters.`;
    else if (password.length > PASSWORD_MAX) found.password = `Use at most ${PASSWORD_MAX} characters.`;
    // Owner rule: the account is only created with a password the meter rates at least "Good".
    else if (!isPasswordStrongEnough(password, emailWords(email))) found.password = WEAK_PASSWORD_MESSAGE;
    if (!confirm) found.confirm = "Confirm your password.";
    else if (confirm !== password) found.confirm = "Passwords don't match.";
    return found;
  };

  const clearError = (name: FieldName) => {
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    setEmailTaken(false);
    const firstInvalid = (["email", "password", "confirm"] as const).find((name) => found[name]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setPending(true);
    // The Better Auth client typing requires `name`; the server stores "" until onboarding.
    const { error } = await signUp.email({ email: email.trim(), password, name: "" });
    if (error) {
      const mapped = mapAuthError(error, "We couldn't create your account. Please try again.");
      if (mapped.field) {
        setErrors({ [mapped.field]: mapped.message });
        setEmailTaken(error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
        focusField(mapped.field);
      } else {
        setFormError(mapped.message);
      }
      setPending(false);
      return;
    }

    markSignedIn();
    queryClient.clear();
    router.replace(withNext("/onboarding", next));
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {google && (
        <>
          <GoogleButton label="Sign up with Google" callbackURL={next ?? "/"} newUserCallbackURL={withNext("/onboarding", next)} />
          <OrDivider label="or sign up with email" />
        </>
      )}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Sign up with email">
        <FormAlert message={formError} />
        <Field
          label="Email"
          error={
            errors.email &&
            (emailTaken ? (
              <>
                {errors.email}{" "}
                <Link href={withNext("/login", next)} className="font-bold underline underline-offset-2">
                  Log in instead
                </Link>
              </>
            ) : (
              errors.email
            ))
          }
        >
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
              clearError("email");
            }}
            size="lg"
          />
        </Field>
        <Field label="Password" error={errors.password}>
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
              clearError("password");
            }}
            size="lg"
          />
        </Field>
        <PasswordStrengthMeter id={meterId} value={password} avoid={emailWords(email)} className="-mt-1" />
        <Field label="Confirm password" error={errors.confirm}>
          <PasswordInput
            ref={confirmRef}
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Type it again"
            maxLength={PASSWORD_MAX}
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              clearError("confirm");
            }}
            size="lg"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending} rightIcon={<ArrowRight aria-hidden />} className="mt-2">
          Create account
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted">
          Next, you&rsquo;ll claim your username and set up your profile.
        </p>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="font-bold text-brand underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
