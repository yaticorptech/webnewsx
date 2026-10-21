"use client";

import { ChevronDown, CircleCheck, Link2, LockKeyhole, Pencil, Plus, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRESS_PASS_MIN_AGE, formatIdNumber, isMaskedAadhaar, type PressPassOptions } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { CityInput } from "./city-input";
import { ChoiceCard, SelectBox } from "./form-controls";
import { LanguagePicker } from "./language-picker";
import { LIMITS, MOBILE_INPUT_MAX, mobileInput, signatureMatches, type PressErrors, type PressPassValues } from "./press-pass-model";
import { COUNTRIES, countryByIso, flagOf } from "@/lib/countries";

type StepProps = {
  values: PressPassValues;
  errors: PressErrors;
  onChange: (patch: Partial<PressPassValues>) => void;
};

const LEGEND = "text-[0.8125rem] font-bold tracking-[0.01em] text-ink";

function ErrorLine({ id, message }: { id: string; message?: string }) {
  return (
    <div aria-live="polite">
      {message && (
        <p id={id} className="mt-2 text-xs font-medium text-brand">
          {message}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── 01 · Personal details ─────────────────────────── */

/** The latest date of birth that is 18 today (the date picker's `max`). */
function adultCutoff(): string {
  const today = new Date();
  const cutoff = new Date(today.getFullYear() - PRESS_PASS_MIN_AGE, today.getMonth(), today.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
}

/**
 * Who the reporter is, for legal matters (owner 2026-10-07): full name as on their ID, date of birth, home address and
 * one government ID. Private — only the Editor Desk sees them. No Aadhaar (a private platform may not collect it).
 */
export function PersonalStep({ values, errors, onChange, options }: StepProps & { options: PressPassOptions }) {
  const idHint = options.idTypes.find((type) => type.value === values.idType)?.hint;
  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2.5 rounded-2xl border border-tint-border bg-tint px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          <strong className="text-ink">Private.</strong> Only the Editor Desk sees these — they&rsquo;re kept in case a legal matter
          ever comes up about your reporting. They never appear on your pass or profile.
        </span>
      </p>

      <div className="grid gap-x-5 gap-y-6 md:grid-cols-2">
        <LegalNameField value={values.legalName} error={errors.legalName} onChange={(legalName) => onChange({ legalName })} />

        <Field label="Date of birth" required hint={`You must be ${PRESS_PASS_MIN_AGE} or older.`} error={errors.dateOfBirth}>
          <Input
            type="date"
            value={values.dateOfBirth}
            max={adultCutoff()}
            min="1900-01-01"
            autoComplete="bday"
            onChange={(event) => onChange({ dateOfBirth: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-x-5 gap-y-6 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Home address" required hint="House, street and area." error={errors.address}>
          <Textarea
            value={values.address}
            rows={1}
            autoGrow
            maxLength={LIMITS.addressMax}
            autoComplete="street-address"
            placeholder="12, 4th Cross, Vijayanagar"
            onChange={(event) => onChange({ address: event.target.value })}
          />
        </Field>
        <Field label="PIN code" required error={errors.pincode}>
          <Input
            value={values.pincode}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="570017"
            onChange={(event) => onChange({ pincode: event.target.value.replace(/\D/g, "").slice(0, 6) })}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Government ID" required hint="Aadhaar is optional — only its last 4 digits are saved." error={errors.idType}>
          <SelectBox
            value={values.idType}
            // Another ID type starts its number afresh (an Aadhaar number never lingers in another field).
            onChange={(event) => onChange({ idType: event.target.value as PressPassValues["idType"], idNumber: "", aadhaarConsent: false })}
          >
            <option value="" disabled>
              Choose one
            </option>
            {options.idTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </SelectBox>
        </Field>
        <Field label="ID number" required hint={idHint} error={errors.idNumber}>
          {values.idType === "aadhaar" ? (
            // 12 digits in groups of 4; a saved one shows masked ("XXXX XXXX 1234") until it's typed again.
            <Input
              value={isMaskedAadhaar(values.idNumber) ? formatIdNumber("aadhaar", values.idNumber) : values.idNumber}
              inputMode="numeric"
              maxLength={14}
              autoComplete="off"
              spellCheck={false}
              placeholder="1234 5678 9012"
              className="font-mono tracking-wide"
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
                onChange({ idNumber: digits.replace(/(\d{4})(?=\d)/g, "$1 ") });
              }}
            />
          ) : (
            <Input
              value={values.idNumber}
              maxLength={LIMITS.idNumberMax}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder={values.idType ? undefined : "Choose the ID first"}
              onChange={(event) => onChange({ idNumber: event.target.value.toUpperCase() })}
            />
          )}
        </Field>
      </div>
      {values.idType === "aadhaar" && (
        <Checkbox
          checked={values.aadhaarConsent}
          onCheckedChange={(checked) => onChange({ aadhaarConsent: checked })}
          label="I agree to share my Aadhaar number for verification. Only its last 4 digits are saved — WebNEWS never stores the full number."
        />
      )}
    </div>
  );
}

/**
 * The full name, filled in from the account (owner 2026-10-07) and locked behind a pencil: tap it to type a different
 * name (it must match the government ID). An empty name starts open.
 */
function LegalNameField({ value, error, onChange }: { value: string; error?: string; onChange: (value: string) => void }) {
  const [editable, setEditable] = useState(() => value.trim() === "");
  const inputRef = useRef<HTMLInputElement>(null);
  const edit = () => {
    setEditable(true);
    // After the re-render that drops readOnly.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };
  return (
    <Field
      label="Full name"
      required
      hint={editable ? "Exactly as on your government ID." : "From your account. Different on your ID? Tap the pencil to change it."}
      error={error}
    >
      <Input
        ref={inputRef}
        value={value}
        readOnly={!editable}
        maxLength={LIMITS.legalNameMax}
        autoComplete="name"
        placeholder="Your full legal name"
        onChange={(event) => onChange(event.target.value)}
        className={cn(!editable && "bg-surface-2")}
        inputClassName={cn(!editable && "font-semibold")}
        suffix={
          !editable && (
            <button
              type="button"
              onClick={edit}
              aria-label="Edit full name"
              title="Edit"
              className="relative -mr-1 inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint-2 hover:text-brand after:absolute after:-inset-1.5 after:content-['']"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          )
        }
      />
    </Field>
  );
}

/* ─────────────────────────── 02 · Verification & region ─────────────────────────── */

export function VerifyStep({
  values,
  errors,
  onChange,
  onMobileBlur,
  options,
}: StepProps & { options: PressPassOptions; onMobileBlur?: () => void }) {
  const uid = useId();
  const districts = options.districts[values.state];
  const staff = values.reporterType === "staff";
  const asksOutlet = staff || values.reporterType === "freelance";

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2.5 rounded-2xl border border-tint-border bg-tint px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          <strong className="text-ink">Private.</strong> Only the Editor Desk sees your mobile number and reporting background — to
          confirm who you are. They never appear on your pass or profile.
        </span>
      </p>

      <fieldset aria-describedby={errors.reporterType ? `${uid}-type-error` : undefined}>
        <legend className={LEGEND}>
          How do you report?<span aria-hidden className="ml-0.5 text-brand">*</span>
        </legend>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3" data-testid="reporter-types">
          {options.reporterTypes.map((type) => (
            <ChoiceCard
              key={type.value}
              name={`${uid}-type`}
              value={type.value}
              label={type.label}
              hint={type.hint}
              checked={values.reporterType === type.value}
              invalid={Boolean(errors.reporterType)}
              onSelect={() => onChange({ reporterType: type.value })}
            />
          ))}
        </div>
        <ErrorLine id={`${uid}-type-error`} message={errors.reporterType} />
      </fieldset>

      {/* Two or three fields a row (owner 2026-10-07): the outlet (when asked) beside the mobile number and experience. */}
      <div className={cn("grid gap-x-5 gap-y-6 sm:grid-cols-2", asksOutlet && "lg:grid-cols-3")}>
        {asksOutlet && (
          <motion.div className="sm:col-span-2 lg:col-span-1" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Field
              label={staff ? "News outlet" : "Outlets you write for"}
              required={staff}
              hint={staff ? "The newspaper, TV channel or news site you work for." : "Optional — where your work has appeared."}
              error={errors.outlet}
            >
              <Input
                value={values.outlet}
                maxLength={LIMITS.outletMax}
                autoComplete="organization"
                placeholder={staff ? "Name of your outlet" : "Outlet names, separated by commas"}
                onChange={(event) => onChange({ outlet: event.target.value })}
              />
            </Field>
          </motion.div>
        )}
        <Field label="Mobile number" required hint="One Press Pass per number." error={errors.mobile}>
          <Input
            value={values.mobile}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={MOBILE_INPUT_MAX}
            placeholder={values.mobileCountry === "IN" ? "98450 12345" : "Mobile number"}
            // Any country (owner 2026-10-15): its flag and code, India first.
            prefix={
              <label className="relative -ml-1 flex items-center gap-1 rounded-md px-1 font-semibold text-ink-2 hover:bg-surface-2">
                <span className="sr-only">Country code</span>
                <span aria-hidden>{flagOf(values.mobileCountry)}</span>
                <span aria-hidden className="tabular-nums">+{countryByIso(values.mobileCountry).dial}</span>
                <ChevronDown aria-hidden className="size-3.5 text-muted" />
                <select
                  value={values.mobileCountry}
                  onChange={(event) =>
                    onChange({ mobileCountry: event.target.value, mobile: mobileInput(values.mobile, event.target.value) })
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.iso} value={country.iso}>
                      {flagOf(country.iso)} {country.name} (+{country.dial})
                    </option>
                  ))}
                </select>
              </label>
            }
            onChange={(event) => onChange({ mobile: mobileInput(event.target.value, values.mobileCountry) })}
            onBlur={onMobileBlur}
          />
        </Field>
        <Field label="Reporting experience" required error={errors.experience}>
          <SelectBox value={values.experience} onChange={(event) => onChange({ experience: event.target.value as PressPassValues["experience"] })}>
            <option value="" disabled>
              Choose one
            </option>
            {options.experience.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectBox>
        </Field>
      </div>

      <div className="grid gap-x-5 gap-y-6 sm:grid-cols-3">
        <Field label="Home state" required error={errors.state}>
          <SelectBox
            value={values.state}
            onChange={(event) => onChange({ state: event.target.value, district: "", city: "" })}
            autoComplete="address-level1"
          >
            {options.regions.map((region) => (
              <option key={region.code} value={region.code}>
                {region.name}
                {region.kind === "ut" ? " (UT)" : ""}
              </option>
            ))}
          </SelectBox>
        </Field>
        <Field
          label="District"
          hint={districts ? undefined : "Optional"}
          error={errors.district}
        >
          {districts ? (
            <SelectBox
              value={values.district}
              // A town from another district no longer fits.
              onChange={(event) => onChange({ district: event.target.value, city: "" })}
            >
              <option value="">Choose a district</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </SelectBox>
          ) : (
            <Input
              value={values.district}
              maxLength={LIMITS.districtMax}
              placeholder="e.g. Pune"
              autoComplete="off"
              onChange={(event) => onChange({ district: event.target.value })}
            />
          )}
        </Field>
        {/* Owner 2026-10-05: organizers find reporters by city. Every city, town and village of the state is suggested
            while typing (picking one also sets its district); the text stays free. */}
        <Field label="City or town" required error={errors.city}>
          <CityInput
            value={values.city}
            onChange={(city) => onChange({ city })}
            onPick={(city) => onChange({ city: city.name, district: city.district })}
            state={values.state}
            district={districts ? values.district : ""}
            maxLength={LIMITS.cityMax}
            placeholder={values.state === "KA" ? "Start typing, e.g. Mangaluru" : "Start typing, e.g. Pune"}
            invalid={Boolean(errors.city)}
          />
        </Field>
      </div>

      <fieldset aria-describedby={errors.languages ? `${uid}-languages-error` : `${uid}-languages-hint`}>
        <legend className={LEGEND}>
          Languages you report in<span aria-hidden className="ml-0.5 text-brand">*</span>
        </legend>
        <p id={`${uid}-languages-hint`} className="mt-1 text-xs text-muted">
          Choose every language you file in — up to {LIMITS.languagesMax}.
        </p>
        <div className="mt-3">
          <LanguagePicker
            options={options.languages}
            value={values.languages}
            max={LIMITS.languagesMax}
            invalid={Boolean(errors.languages)}
            describedBy={errors.languages ? `${uid}-languages-error` : `${uid}-languages-hint`}
            onChange={(languages) => onChange({ languages })}
          />
        </div>
        <ErrorLine id={`${uid}-languages-error`} message={errors.languages} />
      </fieldset>
    </div>
  );
}

/* ─────────────────────────── 03 · About your reporting ─────────────────────────── */

export function AboutStep({ values, errors, onChange }: StepProps) {
  const uid = useId();
  const links = values.links.length > 0 ? values.links : [""];
  const setLink = (index: number, value: string) => onChange({ links: links.map((link, i) => (i === index ? value : link)) });

  return (
    // Side by side on wide screens (owner 2026-10-07).
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <Field
        label="Why I report"
        required
        error={errors.about}
        hint="A line or two for your Press Pass file: what you cover, where, and why it matters."
      >
        <Textarea
          value={values.about}
          maxLength={LIMITS.aboutMax}
          rows={4}
          autoGrow
          maxRows={8}
          placeholder="I cover civic issues across Mysuru — roads, water, ward budgets — because residents deserve to know where the money goes."
          onChange={(event) => onChange({ about: event.target.value })}
        />
      </Field>

      <fieldset aria-describedby={`${uid}-links-hint`}>
        <legend className={LEGEND}>Portfolio &amp; social links</legend>
        <p id={`${uid}-links-hint`} className="mt-1 text-xs text-muted">
          Optional — up to {LIMITS.linksMax}. Earlier reporting, a blog, your X or Instagram.
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {links.map((link, index) => (
            <motion.li
              key={index}
              initial={index === 0 ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2"
            >
              <Input
                value={link}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://"
                aria-label={`Link ${index + 1}`}
                invalid={Boolean(errors.links) && link.trim() !== "" && !/^https?:\/\/\S+\.\S+/i.test(link.trim())}
                prefix={<Link2 className="size-4" />}
                onChange={(event) => setLink(index, event.target.value)}
              />
              {links.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() => onChange({ links: links.filter((_, i) => i !== index) })}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint-2 hover:text-brand"
                >
                  <X aria-hidden className="size-4.5" />
                </button>
              )}
            </motion.li>
          ))}
        </ul>
        {links.length < LIMITS.linksMax && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Plus aria-hidden />}
            className="mt-2 -ml-2 text-brand"
            onClick={() => onChange({ links: [...links, ""] })}
          >
            Add a link
          </Button>
        )}
        <ErrorLine id={`${uid}-links-error`} message={errors.links} />
      </fieldset>
    </div>
  );
}

/* ─────────────────────────── 04 · Reporter Pledge ─────────────────────────── */

export function PledgeStep({
  values,
  errors,
  onChange,
  pledge,
  displayName,
  signed,
}: StepProps & {
  pledge: readonly string[];
  displayName: string;
  /** Already signed (edit mode): show the record instead of the signature fields. */
  signed?: { at: string; signature: string | null } | null;
}) {
  const reduce = useReducedMotion();
  const matches = signatureMatches(values.pledgeSignature, displayName);

  return (
    // Side by side on wide screens (owner 2026-10-07): the pledge, and the signature beside it.
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="card relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-tint-border bg-tint px-4 py-3 sm:px-5">
          <p className="kicker text-brand">The WebNEWS Reporter Pledge</p>
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">{pledge.length} promises</span>
        </div>
        <ol className="flex flex-col divide-y divide-border">
          {pledge.map((line, index) => (
            <motion.li
              key={line}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.08 * index, duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex items-start gap-3 px-4 py-3 text-[0.9375rem] leading-snug text-ink sm:px-5"
            >
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-tint font-wide text-[0.6875rem] font-black tabular-nums text-brand ring-1 ring-tint-border">
                {index + 1}
              </span>
              {line}
            </motion.li>
          ))}
        </ol>
      </div>

      {signed ? (
        <p className="flex items-start gap-2.5 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-ink">
          <CircleCheck aria-hidden className="mt-px size-5 shrink-0 text-success" />
          <span>
            You signed the pledge{signed.signature ? <> as <strong>{signed.signature}</strong></> : null}. It stays on your Press Pass file.
          </span>
        </p>
      ) : (
        <>
          <Field
            label="Sign with your display name"
            required
            error={errors.pledgeSignature}
            hint={
              <>
                Type <strong className="text-ink">{displayName}</strong> exactly as it appears on your profile.
              </>
            }
            labelAside={
              matches ? (
                <span className="inline-flex items-center gap-1 font-bold text-success" aria-live="polite">
                  <CircleCheck aria-hidden className="size-3.5" /> Matches
                </span>
              ) : null
            }
          >
            <Input
              value={values.pledgeSignature}
              maxLength={LIMITS.signatureMax}
              autoComplete="name"
              size="lg"
              inputClassName="font-serif text-xl italic"
              onChange={(event) => onChange({ pledgeSignature: event.target.value })}
            />
          </Field>
          <Field label="Reporter Pledge agreement" hideLabel error={errors.acceptPledge}>
            <Checkbox
              checked={values.acceptPledge}
              onCheckedChange={(checked) => onChange({ acceptPledge: checked })}
              label={
                <>
                  I take the WebNEWS Reporter Pledge. I understand the Editor Desk can review, return or remove my stories and
                  revoke my Press Pass if I break it.
                </>
              }
              className={cn(errors.acceptPledge && "text-brand")}
            />
          </Field>
        </>
      )}
    </div>
  );
}
