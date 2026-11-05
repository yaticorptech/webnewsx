"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, Save } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { countryByIso } from "@/lib/countries";
import type { PressPass, PressPassApplyResponse, PressPassOptions, ReporterLevel } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { previewPassNumber, regionLabel } from "./press-format";
import { PressPassCard, type PressPassCardData } from "./press-pass-card";
import {
  PRESS_STEPS,
  errorsForStep,
  errorsFromApi,
  firstStepWithError,
  initialValues,
  dateOfBirthProblem,
  mobileProblem,
  toApplyInput,
  toUpdateInput,
  validate,
  type PressErrors,
  type PressPassValues,
} from "./press-pass-model";
import { AboutStep, PersonalStep, PledgeStep, VerifyStep } from "./press-pass-steps";

export type PressPassFormMode =
  /** Reader applying → the pass is issued instantly as Trainee. */
  | "apply"
  /** Holder of an incomplete pass (migrated, or issued before verification) filling in what's missing. */
  | "complete"
  /** Holder updating their details (pledge already signed). */
  | "edit";

export type PressPassFormProps = {
  mode: PressPassFormMode;
  holder: { name: string; username: string; image: string | null };
  options: PressPassOptions;
  /** The existing pass (complete / edit). */
  pass: PressPass | null;
  onIssued?: (response: PressPassApplyResponse) => void;
  onSaved?: (pass: PressPass) => void;
  onCancel?: () => void;
  /**
   * Places the live pass mock-up and the form on the page (owner 2026-10-07: the full-width page keeps the pass beside
   * the form). Default: the pass above the form.
   */
  layout?: (parts: { card: ReactNode; form: ReactNode }) => ReactNode;
};

const STEP_COPY = [
  { title: "Your details", lede: "Who you are, how the Editor Desk can verify you, where you file from and a note about your reporting." },
  { title: "The Reporter Pledge", lede: "Five promises every WebNewsX reporter makes. Sign it to get your pass." },
] as const;

/** The first screen's three parts, each under its own heading. */
const DETAIL_SECTIONS = [
  { title: "Personal details", lede: "As on your government ID. Kept privately by the Editor Desk." },
  { title: "Verification & region", lede: "Help the Editor Desk confirm who you are, and tell readers where you file from." },
  { title: "About your reporting", lede: "A short note for the Editor Desk and your Press Pass file." },
] as const;

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * The Press Pass application (SPEC §3.11) in two screens (owner 2026-10-09: four screens took too long): everything
 * about the applicant on the first — personal details, verification & region, about your reporting — with Next, then
 * the Reporter Pledge with the Issue button. Also used to complete a migrated pass or edit your details. A live
 * mock-up of the card fills in as you choose. Next validates the whole first screen with the shared zod rules; server
 * field errors jump back to the screen that owns them.
 */
export function PressPassForm({ mode, holder, options, pass, onIssued, onSaved, onCancel, layout }: PressPassFormProps) {
  const reduce = useReducedMotion();
  const needsPledge = mode === "apply" || !pass?.pledgeSignedAt;
  const viewer = useViewer();
  const [values, setValues] = useState<PressPassValues>(() => initialValues(pass, viewer?.languages, holder.name));
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<PressErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /** Bumped on every failed Next/submit so the first problem is brought into view. */
  const [errorFlash, setErrorFlash] = useState(0);
  /** Became true on the first step change: animate + move focus only after that. */
  const [navigated, setNavigated] = useState(false);

  const last = step === PRESS_STEPS.length - 1;
  const rules = { needsPledge, displayName: holder.name };

  // Move focus to the step heading after Next/Back (not on first render).
  useEffect(() => {
    if (!navigated) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [step, navigated, reduce]);

  // Bring the first invalid field into view and focus it (after the error messages render).
  useEffect(() => {
    if (errorFlash === 0) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current;
      const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"], fieldset[aria-describedby$="-error"] :is(button, input)');
      if (!invalid) return;
      invalid.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      invalid.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [errorFlash, reduce]);

  const showErrors = (problems: PressErrors) => {
    setErrors(problems);
    setErrorFlash((n) => n + 1);
  };

  /** The PIN code's place, shown under the box ("Mangaluru, Dakshina Kannada, Karnataka") — for the PIN it was looked up for. */
  const [pinPlace, setPinPlace] = useState<{ pin: string; label: string } | null>(null);
  /** The PIN in the box right now (an answer for an older PIN is ignored). */
  const pinRef = useRef(values.pincode);

  /**
   * Checks the PIN is a real Indian PIN code (owner 2026-11-05) and fills state, district and town from it — unless
   * the PIN changed again meanwhile. All three stay editable.
   */
  const fillFromPincode = async (pin: string) => {
    const result = await api.pincode(pin).catch(() => null);
    if (!result || pinRef.current !== pin) return; // offline (the server checks again on submit) or already changed
    if (!result.valid) {
      setPinPlace(null);
      setErrors((current) => ({ ...current, pincode: "This PIN code doesn't exist. Check the 6 digits." }));
      return;
    }
    const place = result.place;
    if (!place) return;
    const stateName = options.regions.find((r) => r.code === place.state)?.name ?? place.state;
    setPinPlace({ pin, label: [place.city, place.district, stateName].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") });
    setValues((current) =>
      current.pincode === pin ? { ...current, state: place.state, district: place.district, city: place.city || current.city } : current,
    );
    setErrors((current) => {
      const { state: _s, district: _d, city: _c, pincode: _p, ...rest } = current;
      return rest;
    });
  };

  const change = (patch: Partial<PressPassValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    // Errors only show after a Next attempt; drop each one as soon as its field is fixed.
    let nextErrors = errors;
    if (Object.keys(errors).length > 0) {
      const fresh = validate(next, rules);
      nextErrors = Object.fromEntries(Object.keys(errors).filter((key) => key in fresh).map((key) => [key, fresh[key as keyof PressErrors]]));
    }
    // Except the mobile number, checked as it's typed (owner 2026-09-29).
    // A full PIN code fills the state, district and town (owner 2026-11-05) — all still editable.
    if (patch.pincode !== undefined) pinRef.current = patch.pincode;
    if (patch.pincode !== undefined && /^[1-9][0-9]{5}$/.test(patch.pincode) && patch.pincode !== values.pincode) {
      void fillFromPincode(patch.pincode);
    }
    // And the date of birth: under 18 says so at once (owner 2026-11-05).
    if (patch.dateOfBirth !== undefined) {
      const problem = dateOfBirthProblem(next.dateOfBirth);
      if (problem) nextErrors = { ...nextErrors, dateOfBirth: problem };
      else if ("dateOfBirth" in nextErrors) {
        const { dateOfBirth: _dob, ...rest } = nextErrors;
        nextErrors = rest;
      }
    }
    if (patch.mobile !== undefined || patch.mobileCountry !== undefined) {
      const stillTaken = taken !== null && taken.number === fullNumber(next);
      nextErrors = withMobileError(nextErrors, stillTaken ? taken.message : mobileProblem(next.mobile, { country: next.mobileCountry }));
    }
    if (nextErrors !== errors) setErrors(nextErrors);
  };

  /**
   * One account per mobile number (owner 2026-11-05: "if it exists show error there only — account already exists
   * with name …"): the server's answer for the number as last checked. Null = free or not checked yet.
   */
  const [taken, setTaken] = useState<{ number: string; message: string } | null>(null);
  const fullNumber = (v: PressPassValues) => `+${countryByIso(v.mobileCountry).dial}${v.mobile.replace(/\D/g, "")}`;

  /** Asks the server whether `v`'s number is someone else's; shows the answer at the field. Returns its message, or null. */
  const checkTaken = async (v: PressPassValues): Promise<string | null> => {
    if (mobileProblem(v.mobile, { complete: true, country: v.mobileCountry })) return null;
    const number = fullNumber(v);
    if (taken?.number === number) return taken.message;
    try {
      const result = await api.pressPassMobileCheck(number);
      if (!result.taken || !result.message) {
        setTaken(null);
        return null;
      }
      const message = result.message;
      setTaken({ number, message });
      setErrors((current) => withMobileError(current, message));
      return message;
    } catch {
      // Offline or rate-limited: the server checks again when the pass is submitted.
      return null;
    }
  };

  /** Leaving the mobile field with too few digits says so there and then (an empty one waits for Next); a complete one is checked. */
  const checkMobile = () => {
    const problem = mobileProblem(values.mobile, { complete: true, country: values.mobileCountry });
    if (problem) setErrors((current) => withMobileError(current, problem));
    else void checkTaken(values);
  };

  const goTo = (index: number) => {
    setNavigated(true);
    setDirection(index > step ? 1 : -1);
    setStep(index);
  };

  const next = async () => {
    const problems = errorsForStep(validate(values, rules), step);
    if (Object.keys(problems).length > 0) {
      showErrors(problems);
      return;
    }
    // The mobile number's step doesn't move on while the number is another account's.
    // A PIN code the directory doesn't know stops here too (owner 2026-11-05).
    if (step === 0 && errors.pincode) {
      showErrors({ pincode: errors.pincode });
      return;
    }
    const takenMessage = step === 0 ? await checkTaken(values) : null;
    if (takenMessage) {
      showErrors({ mobile: takenMessage });
      return;
    }
    setErrors({});
    goTo(step + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!last) {
      void next();
      return;
    }
    const problems = validate(values, rules);
    const firstBad = firstStepWithError(problems);
    if (firstBad !== null) {
      showErrors(errorsForStep(problems, firstBad));
      if (firstBad !== step) goTo(firstBad);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "apply") {
        const response = await api.applyPressPass(toApplyInput(values));
        onIssued?.(response);
      } else {
        const response = await api.updatePressPass(toUpdateInput(values, needsPledge));
        if (response.pressPass) onSaved?.(response.pressPass);
      }
    } catch (error) {
      if (isApiError(error)) {
        const fieldErrors = errorsFromApi(error.fields);
        const bad = firstStepWithError(fieldErrors);
        if (bad !== null) {
          showErrors(errorsForStep(fieldErrors, bad));
          if (bad !== step) goTo(bad);
          toast.error(error.message || "Please check your answers", { id: "press-pass-error" });
          return;
        }
      }
      toast.error(mode === "apply" ? "Couldn't issue your Press Pass" : "Couldn't save your Press Pass", {
        id: "press-pass-error",
        description: errorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const preview: PressPassCardData = {
    passNumber: pass?.passNumber ?? previewPassNumber(values.state),
    level: (pass?.level ?? "trainee") as ReporterLevel,
    status: pass ? "active" : "preview",
    holder,
    region: regionLabel({ state: values.state, district: values.district.trim() || null, city: values.city.trim() || null }),
    languages: values.languages,
    issuedAt: pass?.issuedAt ?? null,
  };

  const copy = STEP_COPY[step] ?? STEP_COPY[0];
  const submitLabel = mode === "apply" ? "Issue my Press Pass" : mode === "complete" ? "Complete my Press Pass" : "Save changes";

  // Live mock-up (phones see it on the last step, where it matters most).
  const card = <PressPassCard data={preview} animateIn={false} hints className={cn(last ? "block" : "hidden sm:block")} />;
  const form = (
    <form ref={formRef} noValidate onSubmit={submit} aria-labelledby="press-pass-step-title" className="flex flex-col">
      {/* No step rail and no "Step 01 of 02" (owner 2026-10-08 / 2026-10-09): the title alone says where you are. */}
      <motion.div
        key={step}
        initial={navigated && !reduce ? { opacity: 0, x: 24 * direction } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="pt-1"
      >
        <h2
          id="press-pass-step-title"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-nav font-wider text-2xl font-black leading-tight tracking-[-0.02em] text-ink outline-none sm:text-[1.75rem]"
        >
          {copy.title}
        </h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{copy.lede}</p>

        <div className="mt-6">
          {step === 0 && (
            <div className="flex flex-col gap-10">
              <DetailSection {...DETAIL_SECTIONS[0]}>
                <PersonalStep values={values} errors={errors} onChange={change} options={options} pinPlace={pinPlace?.pin === values.pincode ? pinPlace.label : null} />
              </DetailSection>
              <DetailSection {...DETAIL_SECTIONS[1]}>
                <VerifyStep values={values} errors={errors} onChange={change} onMobileBlur={checkMobile} options={options} />
              </DetailSection>
              <DetailSection {...DETAIL_SECTIONS[2]}>
                <AboutStep values={values} errors={errors} onChange={change} />
              </DetailSection>
            </div>
          )}
          {step === 1 && (
            <PledgeStep
              values={values}
              errors={errors}
              onChange={change}
              pledge={options.pledge}
              displayName={holder.name}
              signed={needsPledge ? null : { at: pass?.pledgeSignedAt ?? "", signature: pass?.pledgeSignature ?? null }}
            />
          )}
        </div>
      </motion.div>

      <div className="mt-8 flex items-center gap-3 border-t border-border pt-5 max-sm:flex-col-reverse max-sm:items-stretch">
        {/* Applying: after the pledge only the Issue button (owner 2026-10-09) — a server error on a detail still
            brings that screen back by itself. Completing / editing keep Back. */}
        {step > 0 && mode !== "apply" ? (
          // No Back in the Android app (owner 2026-10-05): the step bar above goes back a step.
          <span data-app-no-back="" className="contents">
            <Button variant="ghost" leftIcon={<ArrowLeft aria-hidden />} onClick={() => goTo(step - 1)} disabled={submitting}>
              Back
            </Button>
          </span>
        ) : step === 0 && onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <div className="flex-1 max-sm:hidden" />
        {last ? (
          <Button
            type="submit"
            size="lg"
            loading={submitting}
            leftIcon={mode === "edit" ? <Save aria-hidden /> : <BadgeCheck aria-hidden />}
            data-tour="press-pass-issue"
          >
            {submitLabel}
          </Button>
        ) : (
          <Button type="submit" size="lg" rightIcon={<ArrowRight aria-hidden />} data-tour="press-pass-next">
            Next
          </Button>
        )}
      </div>
    </form>
  );

  if (layout) return <>{layout({ card, form })}</>;
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {card}
      {form}
    </div>
  );
}

/** One part of the first screen: a heading, a line on what it's for, then its fields. */
function DetailSection({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-border pt-7 first:border-t-0 first:pt-0">
      <h3 className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{lede}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** `errors` with the mobile number's message set, or removed when `problem` is null. */
function withMobileError(errors: PressErrors, problem: string | null): PressErrors {
  if (problem) return errors.mobile === problem ? errors : { ...errors, mobile: problem };
  if (!("mobile" in errors)) return errors;
  const { mobile: _mobile, ...rest } = errors;
  return rest;
}
