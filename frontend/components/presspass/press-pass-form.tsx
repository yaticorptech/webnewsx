"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, Save } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
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
  { title: "The Reporter Pledge", lede: "Five promises every WebNEWS reporter makes. Sign it to get your pass." },
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
    if (patch.mobile !== undefined || patch.mobileCountry !== undefined)
      nextErrors = withMobileError(nextErrors, mobileProblem(next.mobile, { country: next.mobileCountry }));
    if (nextErrors !== errors) setErrors(nextErrors);
  };

  /** Leaving the mobile field with too few digits says so there and then (an empty one waits for Next). */
  const checkMobile = () => {
    const problem = mobileProblem(values.mobile, { complete: true, country: values.mobileCountry });
    if (problem) setErrors((current) => withMobileError(current, problem));
  };

  const goTo = (index: number) => {
    setNavigated(true);
    setDirection(index > step ? 1 : -1);
    setStep(index);
  };

  const next = () => {
    const problems = errorsForStep(validate(values, rules), step);
    if (Object.keys(problems).length > 0) {
      showErrors(problems);
      return;
    }
    setErrors({});
    goTo(step + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!last) {
      next();
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
                <PersonalStep values={values} errors={errors} onChange={change} options={options} />
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
