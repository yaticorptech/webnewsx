"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { clearWelcomeBack } from "@/components/auth/signed-in-flag";
import { LogoutButton } from "@/components/auth/logout-button";
import { SpeedBarsSvg, SpeedLines } from "@/components/brand/speed-lines";
import { handleText } from "@/components/brand/user-handle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ADMIN_HOME } from "@/lib/admin-home";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { canPublish, LIMITS, USERNAME_MESSAGES, validateNewUsername, type PressLanguage, type ViewerUser } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "./avatar-picker";
import { PressPass } from "./press-pass";
import { ReadLanguagesPicker } from "./read-languages-picker";
import { StepIndicator } from "./step-indicator";
import { useUsernameCheck } from "./use-username-check";
import { UsernameField } from "./username-field";

const STEPS = [
  { key: "byline", label: "Byline" },
  { key: "profile", label: "Profile" },
  { key: "terms", label: "Terms" },
] as const;

type FieldKey = "username" | "name" | "image" | "bio" | "languages" | "acceptTerms";
type Errors = Partial<Record<FieldKey, string>>;

const STEP_OF: Record<FieldKey, number> = { username: 0, name: 0, image: 1, bio: 1, languages: 1, acceptTerms: 2 };
const TERMS_REQUIRED = "You must agree to the Terms & Conditions";
const EASE = [0.2, 0.8, 0.2, 1] as const;

export function isGooglePhoto(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com"));
  } catch {
    return false;
  }
}

/**
 * Three-step profile setup (SPEC §3.9): 01 username + display name → 02 photo + bio →
 * 03 review + Terms. A live "press pass" mirrors the profile as it's filled in.
 * Submit → POST /api/onboarding → `next` (default "/") with a welcome toast.
 */
export function OnboardingForm({ viewer, next }: { viewer: ViewerUser; next: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [reached, setReached] = useState(0);
  const [navigated, setNavigated] = useState(false);

  const [username, setUsername] = useState("");
  const [name, setName] = useState(viewer.name ?? "");
  const [bio, setBio] = useState(viewer.bio ?? "");
  const [image, setImage] = useState<string | null>(viewer.image);
  const [languages, setLanguages] = useState<PressLanguage[]>(viewer.languages ?? []);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverUsernameError, setServerUsernameError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const check = useUsernameCheck(username);
  const usernameRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const welcome = useRef<{ name: string; username: string | null; publisher: boolean; admin: boolean } | null>(null);
  const googlePhoto = isGooglePhoto(viewer.image) ? viewer.image : null;

  const clearError = (key: FieldKey) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setNavigated(true);
    setStep(target);
    setReached((r) => Math.max(r, target));
  };

  /** Resolves the username verdict now (skips the debounce; cached for 30s). null = OK. */
  const verifyUsername = async (): Promise<string | null> => {
    if (!username) return "Choose a username";
    const format = validateNewUsername(username);
    if (!format.ok && format.code !== "reserved") return format.message;
    try {
      const result = await queryClient.fetchQuery({
        queryKey: qk.usernameCheck(username),
        queryFn: ({ signal }) => api.checkUsername(username, signal),
        staleTime: 30_000,
      });
      return result.available ? null : result.message || USERNAME_MESSAGES.taken;
    } catch {
      return null; // Couldn't check (network / rate limit): the server validates on submit.
    }
  };

  const localErrors = (index: number): Errors => {
    const found: Errors = {};
    if (index === 0 && !name.trim()) found.name = "Name is required";
    if (index === 1) {
      if (!image) found.image = "Please add a profile photo";
      if (!bio.trim()) found.bio = "Bio is required";
      if (languages.length === 0) found.languages = "Pick at least one language you read";
    }
    if (index === 2 && !acceptTerms) found.acceptTerms = TERMS_REQUIRED;
    return found;
  };

  const focusFirst = (found: Errors) => {
    if (found.username) usernameRef.current?.focus();
    else if (found.name) nameRef.current?.focus();
    else if (found.bio) bioRef.current?.focus();
    else if (found.acceptTerms) termsRef.current?.focus();
  };

  const advance = async () => {
    if (step === 0) {
      setValidating(true);
      const usernameError = await verifyUsername();
      setValidating(false);
      const found = { ...localErrors(0), ...(usernameError ? { username: usernameError } : {}) };
      setErrors(found);
      if (Object.keys(found).length > 0) return focusFirst(found);
      return goTo(1);
    }
    if (step === 1) {
      if (avatarBusy) return;
      const found = localErrors(1);
      setErrors(found);
      if (Object.keys(found).length > 0) return focusFirst(found);
      return goTo(2);
    }
    await submit();
  };

  const submit = async () => {
    const found: Errors = { ...localErrors(0), ...localErrors(1), ...localErrors(2) };
    const firstStep = Math.min(...(Object.keys(found) as FieldKey[]).map((key) => STEP_OF[key]));
    if (Number.isFinite(firstStep)) {
      setErrors(found);
      if (firstStep !== step) goTo(firstStep);
      else focusFirst(found);
      return;
    }
    if (!image) return;

    setSubmitting(true);
    try {
      const { user } = await api.onboard({ username, name: name.trim(), bio: bio.trim(), image, languages, acceptTerms: true });
      queryClient.removeQueries({ queryKey: qk.viewer });
      // Admins only run the Editor Desk (they don't publish on the site), so they get no Publish / Press Pass step.
      welcome.current = { name: user.name, username: user.username, publisher: canPublish(user) && user.role !== "admin", admin: user.role === "admin" };
      router.replace(user.role === "admin" ? ADMIN_HOME : (next ?? "/"));
      router.refresh();
    } catch (error) {
      setSubmitting(false);
      if (!isApiError(error)) {
        toast.error("Couldn't finish your profile", { description: errorMessage(error) });
        return;
      }
      if (error.code === "already_onboarded") {
        router.replace(next ?? "/");
        router.refresh();
        return;
      }
      if (error.isUnauthorized) {
        toast.error("Your session expired", { description: "Log in again to finish your profile." });
        router.replace("/login?next=%2Fonboarding");
        return;
      }
      if (error.code === "username_taken") {
        void check.invalidate(username);
        setServerUsernameError(USERNAME_MESSAGES.taken);
        setErrors({ username: USERNAME_MESSAGES.taken });
        goTo(0);
        return;
      }
      const fields = error.fields ?? {};
      const mapped: Errors = {};
      for (const key of Object.keys(STEP_OF) as FieldKey[]) if (fields[key]) mapped[key] = fields[key];
      const keys = Object.keys(mapped) as FieldKey[];
      if (keys.length > 0) {
        if (mapped.username) setServerUsernameError(mapped.username);
        setErrors(mapped);
        goTo(Math.min(...keys.map((key) => STEP_OF[key])));
        return;
      }
      toast.error("Couldn't finish your profile", { description: error.message });
    }
  };

  // The welcome toast is raised when the destination actually replaces this page (unmount), so a
  // slow first render of the front page can't let it expire unseen while the wizard is still shown.
  useEffect(() => {
    return () => {
      const user = welcome.current;
      if (!user) return;
      clearWelcomeBack();
      if (user.admin) {
        toast.success(`Welcome to the Editor Desk, ${user.name}`, {
          id: "onboarding-welcome",
          description: "Your profile is ready. Review stories, handle reports and run the platform from here.",
          duration: 10_000,
        });
        return;
      }
      toast.success(`Welcome to WebNEWS, ${user.name}`, {
        id: "onboarding-welcome",
        // Readers never get a publish control (SPEC §3.11); their next step is the Press Pass.
        description: user.publisher
          ? `Your username is ${handleText(user.username ?? "")}. Your byline is ready — publish your first story whenever you like.`
          : `Your username is ${handleText(user.username ?? "")}. Follow reporters, save stories — and get a Press Pass when you want to report.`,
        action: user.publisher ? { label: "Publish", href: "/publish" } : { label: "Get your Press Pass", href: "/press-pass" },
        duration: 10_000,
      });
    };
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validating || submitting) return;
    void advance();
  };

  // Warm the destination while the reader reviews step 3, so "Finish setup" lands instantly.
  useEffect(() => {
    if (step === 2) router.prefetch(next ?? "/");
  }, [step, next, router]);

  const busy = validating || submitting || (step === 1 && avatarBusy);
  const preview = <PressPass username={username} name={name} bio={bio} image={image} />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-14 xl:gap-20">
      <div className="min-w-0">
        <header>
          <p className="kicker flex items-center gap-2 text-brand">
            <SpeedLines />
            Welcome to WebNEWS
          </p>
          <h1 className="mt-3 font-wide text-[2rem] leading-[1.02] font-black tracking-tight text-ink sm:text-[2.625rem]">
            Set up your byline
          </h1>
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
            Three quick steps and you&rsquo;re on the wire. Everything here appears on your public profile.
          </p>
        </header>

        <StepIndicator steps={STEPS} current={step} reached={reached} onSelect={goTo} className="mt-8" />

        <form
          noValidate
          onSubmit={onSubmit}
          aria-label="Set up your profile"
          className="card relative mt-6 overflow-hidden"
        >
          <span aria-hidden className="absolute top-0 left-0 h-0.75 w-24 bg-brand" />
          <div className="px-5 pt-7 pb-2 sm:px-8 sm:pt-9">
            {/* Keyed enter-only slide: the next step mounts at once (never blocked by an exit animation). */}
            <motion.div
              key={step}
              initial={navigated ? { opacity: 0, x: direction * 36 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
            >
              {step === 0 && (
                <StepPanel
                  focusOnMount={navigated}
                  kicker="Step 1 of 3"
                  title="Claim your byline"
                  lede="Your username is how readers find, mention and follow you."
                >
                  <UsernameField
                    value={username}
                    onChange={(value) => {
                      setUsername(value);
                      setServerUsernameError(null);
                      clearError("username");
                    }}
                    status={check.status}
                    onPickSuggestion={(suggestion) => {
                      check.primeAvailable(suggestion);
                      setUsername(suggestion);
                      setServerUsernameError(null);
                      clearError("username");
                    }}
                    error={serverUsernameError ?? errors.username}
                    autoFocus={!navigated}
                    inputRef={usernameRef}
                  />
                  <Field
                    label="Display name"
                    required
                    error={errors.name}
                    hint="Your name, or the name of your newsroom."
                    labelAside={`${name.length}/${LIMITS.nameMax}`}
                  >
                    <Input
                      ref={nameRef}
                      name="name"
                      autoComplete="name"
                      maxLength={LIMITS.nameMax}
                      placeholder="Ada Lovelace"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        clearError("name");
                      }}
                      size="lg"
                      enterKeyHint="next"
                    />
                  </Field>
                </StepPanel>
              )}

              {step === 1 && (
                <StepPanel
                  focusOnMount={navigated}
                  kicker="Step 2 of 3"
                  title="Put a face to the byline"
                  lede="A clear photo and a short bio help readers trust who's reporting. Pick the languages you read for your feeds."
                >
                  <AvatarPicker
                    value={image}
                    onChange={(url) => {
                      setImage(url);
                      clearError("image");
                    }}
                    name={name || username}
                    error={errors.image}
                    onBusyChange={setAvatarBusy}
                    sourceBadge={googlePhoto && image === googlePhoto ? "From your Google account" : null}
                  />
                  <Field label="Bio" required error={errors.bio} hint="Line breaks are kept.">
                    <Textarea
                      ref={bioRef}
                      name="bio"
                      maxLength={LIMITS.bioMax}
                      rows={3}
                      autoGrow
                      maxRows={6}
                      placeholder={"Court reporter in Mumbai.\nI cover city hall, transit and the stories in between."}
                      value={bio}
                      onChange={(event) => {
                        setBio(event.target.value);
                        clearError("bio");
                      }}
                    />
                  </Field>
                  <ReadLanguagesPicker
                    value={languages}
                    onChange={(next) => {
                      setLanguages(next);
                      clearError("languages");
                    }}
                    error={errors.languages}
                  />
                </StepPanel>
              )}

              {step === 2 && (
                <StepPanel
                  focusOnMount={navigated}
                  kicker="Step 3 of 3"
                  title="Check your press pass"
                  lede="This is how you'll appear on your profile and bylines. You can change it any time in Settings."
                >
                  <div className="lg:hidden">{preview}</div>
                  <div className="rounded-xl border border-tint-border bg-tint p-4 sm:p-5">
                    <Checkbox
                      ref={termsRef}
                      name="acceptTerms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => {
                        setAcceptTerms(checked);
                        clearError("acceptTerms");
                      }}
                      invalid={Boolean(errors.acceptTerms)}
                      aria-describedby={errors.acceptTerms ? "terms-error" : undefined}
                      label={
                        <>
                          I agree to the{" "}
                          <a href="/terms" target="_blank" rel="noopener" className="font-bold text-brand underline underline-offset-2 hover:text-brand-hover">
                            Terms &amp; Conditions
                          </a>{" "}
                          and{" "}
                          <a href="/privacy" target="_blank" rel="noopener" className="font-bold text-brand underline underline-offset-2 hover:text-brand-hover">
                            Privacy Policy
                          </a>
                          .
                        </>
                      }
                    />
                    <p className="mt-3 pl-8 text-xs leading-relaxed text-muted">
                      In short: you own what you publish, you&rsquo;re responsible for it, and misinformation, hate and
                      illegal content aren&rsquo;t allowed.
                    </p>
                    <div aria-live="polite">
                      {errors.acceptTerms && (
                        <p id="terms-error" className="mt-2 pl-8 text-xs font-semibold text-brand">
                          {errors.acceptTerms}
                        </p>
                      )}
                    </div>
                  </div>
                </StepPanel>
              )}
            </motion.div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-5 py-4 sm:px-8">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => goTo(step - 1)} leftIcon={<ArrowLeft aria-hidden />} disabled={submitting}>
                Back
              </Button>
            ) : (
              <span className="text-xs text-muted">Takes about a minute</span>
            )}
            <Button
              type="submit"
              size="lg"
              loading={busy}
              rightIcon={step === 2 ? <SpeedBarsSvg /> : <ArrowRight aria-hidden />}
              className="min-w-40"
            >
              {/* Role-neutral: every new account is a Reader (publishing starts with a Press Pass). */}
              {step === 2 ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted lg:hidden">
          <span className="min-w-0 break-all">
            Signed in as <span className="font-semibold text-ink-2">{viewer.email}</span>
          </span>
          <LogoutButton variant="ghost" size="sm" label="Not you? Log out" className="-mx-3 text-muted hover:text-brand" />
        </div>
      </div>

      <aside aria-label="Live preview" className="sticky top-8 hidden lg:block">
        <p className="kicker mb-3 flex items-center gap-2 text-muted">
          <PulseDot size="xs" />
          Live preview
        </p>
        {preview}
        <div className="mt-4 flex flex-col items-start gap-1 text-xs leading-relaxed text-muted">
          <span className="break-all">
            Signed in as <span className="font-semibold text-ink-2">{viewer.email}</span>
          </span>
          <LogoutButton variant="ghost" size="sm" label="Not you? Log out" className="-mx-3 text-muted hover:text-brand" />
        </div>
      </aside>
    </div>
  );
}

function StepPanel({
  kicker,
  title,
  lede,
  focusOnMount,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  focusOnMount: boolean;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: false });
    // Only when the panel appears (step change), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby={`${kicker}-title`.replace(/\s+/g, "-")} className="flex flex-col gap-6">
      <div>
        <p className="kicker text-brand">{kicker}</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          id={`${kicker}-title`.replace(/\s+/g, "-")}
          className="mt-1.5 font-wide text-2xl leading-tight font-extrabold tracking-[-0.015em] text-ink outline-none sm:text-[1.75rem]"
        >
          {title}
        </h2>
        <p className={cn("mt-2 text-sm leading-relaxed text-muted")}>{lede}</p>
      </div>
      {children}
    </section>
  );
}
