"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { WhatsAppIcon } from "@/components/feed/share-glyphs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ADMIN_HOME } from "@/lib/admin-home";
import { api, errorMessage, request } from "@/lib/api";
import { signInWithPhonePassword } from "@/lib/auth-client";
import { WEAK_PASSWORD_MESSAGE, isPasswordStrongEnough } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { PASSWORD_MAX, PASSWORD_MIN } from "./auth-errors";
import { FormAlert, FormNotice } from "./form-bits";
import { withNext } from "./next-path";
import { PasswordInput } from "./password-input";
import { PasswordStrengthMeter } from "./password-strength";
import { markSignedIn, markWelcomeBack } from "./signed-in-flag";

/*
 * WhatsApp number + password (owner 2026-10-23). One form for Log in and Create account:
 *
 *  1. The WhatsApp number → we check it (POST /api/phone-auth/check).
 *  2. Verified, with a password → the password, and in.
 *  3. Not verified yet (or Forgot password) → "This number isn't verified" with "Verify on WhatsApp": WhatsApp opens a
 *     chat with WebNEWS, a one-time code typed in; they press Send. WhatsApp tells us which number sent it and answers
 *     "Number verified" in that chat; this page sees it within seconds (GET /status) …
 *  4. … and asks for a password (new accounts: create one; Forgot password: a new one) → signed in. New accounts then
 *     go through onboarding (name, username).
 */

export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+974", name: "Qatar", flag: "🇶🇦" },
  { code: "+965", name: "Kuwait", flag: "🇰🇼" },
  { code: "+968", name: "Oman", flag: "🇴🇲" },
  { code: "+973", name: "Bahrain", flag: "🇧🇭" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+60", name: "Malaysia", flag: "🇲🇾" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+977", name: "Nepal", flag: "🇳🇵" },
  { code: "+94", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "+880", name: "Bangladesh", flag: "🇧🇩" },
];
/** How often the page asks whether the WhatsApp message has arrived. */
const POLL_MS = 2000;

type Step = "phone" | "password" | "verify" | "set-password";
type Check = { id: string; code: string; link: string };
type CheckStatus = "pending" | "verified" | "wrong_number" | "expired";

export function PhoneAuthForm({ next, mode }: { next: string | null; mode: "login" | "signup" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const meterId = useId();
  const [country, setCountry] = useState("+91");
  const [number, setNumber] = useState("");
  const [step, setStep] = useState<Step>("phone");
  /** The account exists already (Forgot password, or an older account without a password). */
  const [existing, setExisting] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [checkStatus, setCheckStatus] = useState<CheckStatus>("pending");
  /** They tapped "Verify on WhatsApp": now we wait for the message. */
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const digits = number.replace(/\D/g, "");
  const full = `${country}${digits}`;
  const pretty = `${country} ${digits.replace(/(\d{5})(?=\d)/g, "$1 ")}`;

  // Waiting for the WhatsApp message: ask every couple of seconds.
  useEffect(() => {
    if (step !== "verify" || !check) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const { status } = await request<{ status: CheckStatus }>(`/api/phone-auth/status/${check.id}`);
        if (stopped) return;
        setCheckStatus(status);
        if (status === "verified") {
          setStep("set-password");
          setTimeout(() => passwordRef.current?.focus(), 80);
        }
      } catch {
        // A missed poll; the next one tries again.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, check]);

  const validNumber = () => {
    if (digits.length < 6 || digits.length > 14 || (country === "+91" && digits.length !== 10)) {
      setError(country === "+91" ? "Enter your 10-digit mobile number." : "Enter a valid mobile number.");
      numberRef.current?.focus();
      return false;
    }
    return true;
  };

  /** A fresh WhatsApp check (the link is ready before the tap, so it opens as a real link — never blocked). */
  const startCheck = async (accountExists: boolean) => {
    setPending(true);
    try {
      const created = await request<Check>("/api/phone-auth/start", { method: "POST", body: { phoneNumber: full } });
      setCheck(created);
      setCheckStatus("pending");
      setOpened(false);
      setExisting(accountExists);
      setStep("verify");
    } catch (failed) {
      setError(errorMessage(failed, "Couldn't start the WhatsApp check. Please try again."));
    } finally {
      setPending(false);
    }
  };

  const submitNumber = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!validNumber()) return;
    setPending(true);
    try {
      const result = await request<{ status: "password" | "verify"; existing: boolean }>("/api/phone-auth/check", {
        method: "POST",
        body: { phoneNumber: full },
      });
      setPending(false);
      if (result.status === "password") {
        setStep("password");
        setPassword("");
        setTimeout(() => passwordRef.current?.focus(), 50);
      } else {
        await startCheck(result.existing);
      }
    } catch (failed) {
      setPending(false);
      setError(errorMessage(failed, "Couldn't check the number. Please try again."));
    }
  };

  /** Signed in: new accounts (no name yet) go to onboarding, the Editor Desk to its console, everyone else on. */
  const finish = async () => {
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

  const logIn = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!password) {
      setError("Enter your password.");
      passwordRef.current?.focus();
      return;
    }
    setPending(true);
    const { error: failed } = await signInWithPhonePassword(full, password);
    if (failed) {
      setPending(false);
      setError(
        failed.status === 429
          ? "Too many tries. Wait a minute and try again."
          : failed.code === "INVALID_PHONE_NUMBER_OR_PASSWORD"
            ? "That password isn't right. Try again, or tap Forgot password."
            : failed.message || "Couldn't log in. Please try again.",
      );
      passwordRef.current?.select();
      return;
    }
    await finish();
  };

  const setNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !check) return;
    setError(null);
    if (password.length < PASSWORD_MIN) return fail(`Use at least ${PASSWORD_MIN} characters.`);
    if (password.length > PASSWORD_MAX) return fail(`Use at most ${PASSWORD_MAX} characters.`);
    if (!isPasswordStrongEnough(password, [])) return fail(WEAK_PASSWORD_MESSAGE);
    if (confirm !== password) return setError("The two passwords don't match.");
    setPending(true);
    try {
      await request("/api/phone-auth/complete", { method: "POST", body: { id: check.id, password } });
    } catch (failed) {
      setPending(false);
      setError(errorMessage(failed, "Couldn't save your password. Please try again."));
      return;
    }
    await finish();
  };

  function fail(message: string) {
    setError(message);
    passwordRef.current?.focus();
  }

  const backToNumber = () => {
    setStep("phone");
    setCheck(null);
    setError(null);
    setPassword("");
    setConfirm("");
  };

  const changeNumber = (
    <button type="button" onClick={backToNumber} className="font-bold text-brand underline-offset-4 hover:underline">
      Change number
    </button>
  );

  if (step === "password") {
    return (
      <form noValidate onSubmit={logIn} className="flex flex-col gap-4" aria-label="Log in with your password">
        <FormAlert message={error} />
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{pretty}</span> · {changeNumber}
        </p>
        <Field label="Password">
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
            size="lg"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending} rightIcon={<ArrowRight aria-hidden />}>
          Log in
        </Button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            void startCheck(true);
          }}
          className="self-center text-sm font-bold text-brand underline-offset-4 hover:underline disabled:text-muted"
        >
          Forgot password?
        </button>
      </form>
    );
  }

  if (step === "set-password") {
    return (
      <form noValidate onSubmit={setNewPassword} className="flex flex-col gap-4" aria-label="Set your password">
        <FormNotice message={`${pretty} is verified on WhatsApp.`} />
        <FormAlert message={error} />
        <Field label={existing ? "New password" : "Create a password"} hint="You'll log in with your number and this password.">
          <PasswordInput
            ref={passwordRef}
            name="new-password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN} characters`}
            aria-describedby={meterId}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
            size="lg"
          />
        </Field>
        <PasswordStrengthMeter id={meterId} value={password} className="-mt-1" />
        <Field label="Confirm password">
          <PasswordInput
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              if (error) setError(null);
            }}
            size="lg"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending} rightIcon={<ArrowRight aria-hidden />}>
          {existing ? "Save and log in" : "Create account"}
        </Button>
      </form>
    );
  }

  return (
    <>
      <form
        noValidate
        onSubmit={submitNumber}
        className="flex flex-col gap-4"
        aria-label={mode === "signup" ? "Create an account with your WhatsApp number" : "Log in with your WhatsApp number"}
      >
        <FormAlert message={error} />
        <Field label="WhatsApp number">
          <Input
            ref={numberRef}
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={country === "+91" ? "98765 43210" : "Mobile number"}
            value={number}
            onChange={(event) => {
              setNumber(event.target.value.replace(/[^\d\s]/g, "").slice(0, 16));
              if (error) setError(null);
            }}
            size="lg"
            prefix={
              <select
                aria-label="Country code"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className={cn("h-full cursor-pointer bg-transparent pr-1 text-[0.9375rem] font-bold text-ink outline-none", "-ml-1")}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
            }
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={pending && step === "phone"} rightIcon={<ArrowRight aria-hidden />}>
          Continue
        </Button>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
          <span>
            Your number stays private &mdash; it&apos;s only used to sign you in.{" "}
            {mode === "signup" && (
              <>
                By continuing you agree to the{" "}
                <Link href="/terms" className="font-semibold text-brand underline underline-offset-2">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="font-semibold text-brand underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </>
            )}
          </span>
        </p>
      </form>

      {/* "This number isn't verified": one tap opens WhatsApp with the code typed in; then we wait for it. */}
      <Modal
        open={step === "verify"}
        onOpenChange={(open) => {
          if (!open) backToNumber();
        }}
        title={existing ? "Verify it's your number" : "This number isn't verified"}
        description={
          existing
            ? `To set a new password, confirm ${pretty} on WhatsApp.`
            : `Verify ${pretty} on WhatsApp — it takes one tap. Then you'll set a password.`
        }
        size="sm"
      >
        <div className="flex flex-col gap-4 px-5 py-5">
          {checkStatus === "expired" ? (
            <>
              <FormAlert message="That check expired. Start a new one." />
              <Button size="lg" fullWidth loading={pending} onClick={() => void startCheck(existing)}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <ol className="flex flex-col gap-2.5 text-sm text-ink-2">
                <li className="flex items-center gap-3">
                  <StepDot n={1} done={opened} /> Tap <span className="font-semibold text-ink">Verify on WhatsApp</span>
                </li>
                <li className="flex items-center gap-3">
                  <StepDot n={2} done={false} /> Press <span className="font-semibold text-ink">Send</span> on the message (don&apos;t change it)
                </li>
                <li className="flex items-center gap-3">
                  <StepDot n={3} done={false} /> Come back here — we&apos;ll take it from there
                </li>
              </ol>
              {check && (
                <Button
                  href={check.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="lg"
                  fullWidth
                  leftIcon={<WhatsAppIcon size={20} />}
                  onClick={() => setOpened(true)}
                >
                  {opened ? "Open WhatsApp again" : "Verify on WhatsApp"}
                </Button>
              )}
              {checkStatus === "wrong_number" && (
                <FormAlert message={`That message came from a different WhatsApp number. Send it from the WhatsApp on ${pretty}.`} />
              )}
              {opened && checkStatus !== "wrong_number" && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted" role="status">
                  <LoaderCircle aria-hidden className="size-4 animate-spin text-brand" />
                  Waiting for your WhatsApp message…
                </p>
              )}
              {check && (
                <p className="text-center text-xs text-muted">
                  Your code: <span className="font-bold tracking-wider text-ink">{check.code}</span>
                </p>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return done ? (
    <CircleCheck aria-hidden className="size-6 shrink-0 text-success" />
  ) : (
    <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-bold text-brand">
      {n}
    </span>
  );
}
