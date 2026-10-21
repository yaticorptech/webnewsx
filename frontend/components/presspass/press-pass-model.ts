import { DEFAULT_COUNTRY, countryByIso, splitPhone } from "@/lib/countries";
import {
  PRESS_ID_TYPE_LABELS,
  PRESS_PASS_LIMITS,
  isMaskedAadhaar,
  isValidAadhaar,
  isValidIdNumber,
  maskAadhaar,
  pressPassApplySchema,
  type PressIdType,
  type PressLanguage,
  type PressPass,
  type PressPassApplyInput,
  type PressPassUpdateInput,
  type ReporterType,
  type ReportingExperience,
} from "@/lib/shared/contracts";

/*
 * Pure model of the 4-step Press Pass application (SPEC §3.11): 01 Personal details (owner 2026-10-07) · 02 Verification
 * & region · 03 About your reporting · 04 Reporter Pledge. Validation reuses the shared zod schema so the messages
 * match the API.
 */

export type PressPassValues = {
  /** Personal details (owner 2026-10-07): private, kept for legal matters. */
  legalName: string;
  /** `YYYY-MM-DD` (the date input's value). */
  dateOfBirth: string;
  address: string;
  pincode: string;
  idType: PressIdType | "";
  /** As typed — for Aadhaar the 12 digits (only the last 4 are ever sent: toApplyInput), or the saved "XXXXXXXX1234". */
  idNumber: string;
  /** Aadhaar only (owner 2026-10-08): the reporter agreed to share it for verification. */
  aadhaarConsent: boolean;
  /** The number as typed, without its country code (owner 2026-10-15: any country); the API normalizes it. */
  mobile: string;
  /** The country of the number (ISO code, lib/countries.ts); India by default. */
  mobileCountry: string;
  reporterType: ReporterType | "";
  /** Staff: required; freelance: optional; citizen: not asked (sent as null). */
  outlet: string;
  experience: ReportingExperience | "";
  state: string;
  district: string;
  /** City or town (owner 2026-10-05). */
  city: string;
  languages: PressLanguage[];
  about: string;
  /** Always 1–3 inputs in the UI; blanks are dropped on submit. */
  links: string[];
  pledgeSignature: string;
  acceptPledge: boolean;
};

export type PressField =
  | "legalName"
  | "dateOfBirth"
  | "address"
  | "pincode"
  | "idType"
  | "idNumber"
  | "reporterType"
  | "outlet"
  | "mobile"
  | "experience"
  | "state"
  | "district"
  | "city"
  | "languages"
  | "about"
  | "links"
  | "pledgeSignature"
  | "acceptPledge";
export type PressErrors = Partial<Record<PressField, string>>;

/**
 * Two screens (owner 2026-10-09: "page to page takes too long"; before: four): everything about the applicant on one
 * page — personal details, verification & region, about your reporting — then the Pledge with the Issue button.
 */
export const PRESS_STEPS = [
  { key: "details", label: "Your details", short: "Details" },
  { key: "pledge", label: "Pledge", short: "Pledge" },
] as const;

export const STEP_OF: Record<PressField, number> = {
  legalName: 0,
  dateOfBirth: 0,
  address: 0,
  pincode: 0,
  idType: 0,
  idNumber: 0,
  reporterType: 0,
  outlet: 0,
  mobile: 0,
  experience: 0,
  state: 0,
  district: 0,
  city: 0,
  languages: 0,
  about: 0,
  links: 0,
  pledgeSignature: 1,
  acceptPledge: 1,
};

const FIELDS = Object.keys(STEP_OF) as PressField[];

/** Longest value of the mobile field: 10 digits + the space ("98450 12345") for India; 14 digits elsewhere. */
export const MOBILE_INPUT_MAX = 14;

/**
 * The mobile field holds only the 10 digits after its fixed "+91" (owner 2026-09-29), shown as "98450 12345". Anything
 * but digits is dropped, as is a pasted +91 / 91 / 0 in front; the rest is cut to 10 digits.
 */
export function mobileInput(value: string, country = DEFAULT_COUNTRY): string {
  // Other countries: just the digits (up to 14 — the longest national numbers).
  if (country !== "IN") return value.replace(/\D/g, "").slice(0, 14);
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

/**
 * The mobile number's problem while it's being typed (owner 2026-09-29: shown at the field, not only after Continue):
 * a first digit that no Indian mobile number starts with at once; too few digits only once the field is left
 * (`complete`). Empty = nothing here (Continue asks for it).
 */
export function mobileProblem(value: string, { complete = false, country = DEFAULT_COUNTRY }: { complete?: boolean; country?: string } = {}): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (country !== "IN") {
    const dial = countryByIso(country).dial;
    if (dial.length + digits.length > 15) return "That's too many digits for a phone number.";
    return complete && dial.length + digits.length < 7 ? "Enter the full number." : null;
  }
  if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
  if (digits.length < 10) return complete ? `Enter all 10 digits (${digits.length} so far).` : null;
  return null;
}

/** `languages`: when applying, the languages they picked at sign-up (owner 2026-10-05: one list per account). */
/**
 * The form's starting values: the pass's own, else the account's — its languages and, for the full name, the name the
 * reporter signed up with (owner 2026-10-07: filled in, with a pencil to change it).
 */
export function initialValues(pass: PressPass | null, languages: readonly PressLanguage[] = [], accountName = ""): PressPassValues {
  return {
    legalName: pass?.legalName || accountName.trim(),
    dateOfBirth: pass?.dateOfBirth ?? "",
    address: pass?.address ?? "",
    pincode: pass?.pincode ?? "",
    idType: pass?.idType ?? "",
    idNumber: pass?.idNumber ?? "",
    // A saved Aadhaar was given with consent.
    aadhaarConsent: pass?.idType === "aadhaar",
    ...(() => {
      const { iso, national } = splitPhone(pass?.mobile ?? "");
      return { mobile: mobileInput(national, iso), mobileCountry: iso };
    })(),
    reporterType: pass?.reporterType ?? "",
    outlet: pass?.outlet ?? "",
    experience: pass?.experience ?? "",
    state: pass?.state && pass.state !== "IN" ? pass.state : "KA",
    district: pass?.district ?? "",
    city: pass?.city ?? "",
    languages: pass?.languages?.length ? [...pass.languages] : languages.slice(0, PRESS_PASS_LIMITS.languagesMax),
    about: pass?.about ?? "",
    links: pass?.links?.length ? [...pass.links] : [""],
    pledgeSignature: "",
    acceptPledge: false,
  };
}

/** Same comparison as the backend (trim, collapse spaces, case-insensitive). */
export function signatureMatches(signature: string, displayName: string): boolean {
  const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(signature) !== "" && norm(signature) === norm(displayName);
}

export function toApplyInput(values: PressPassValues): PressPassApplyInput {
  return {
    legalName: values.legalName.trim(),
    dateOfBirth: values.dateOfBirth,
    address: values.address.trim(),
    pincode: values.pincode.trim(),
    // An empty choice fails the schema with its own "Choose an ID".
    idType: values.idType as PressIdType,
    // Aadhaar: only "XXXXXXXX" + its last 4 digits ever leave the browser.
    idNumber: values.idType === "aadhaar" && !isMaskedAadhaar(values.idNumber) ? maskAadhaar(values.idNumber) : values.idNumber.trim(),
    // "+<country code><number>" (owner 2026-10-15: any country).
    mobile: values.mobile.trim() ? `+${countryByIso(values.mobileCountry).dial}${values.mobile.replace(/\D/g, "")}` : "",
    // Empty choices fail the schema with its own "Choose …" messages.
    reporterType: values.reporterType as ReporterType,
    outlet: values.reporterType === "citizen" ? null : values.outlet.trim() || null,
    experience: values.experience as ReportingExperience,
    state: values.state,
    district: values.district.trim() || null,
    city: values.city.trim(),
    languages: values.languages,
    about: values.about.trim(),
    links: values.links.map((link) => link.trim()).filter(Boolean),
    pledgeSignature: values.pledgeSignature.trim(),
    acceptPledge: values.acceptPledge as true,
  };
}

export function toUpdateInput(values: PressPassValues, signPledge: boolean): PressPassUpdateInput {
  const { pledgeSignature, acceptPledge, ...rest } = toApplyInput(values);
  return signPledge ? { ...rest, pledgeSignature, acceptPledge } : rest;
}

/** First message per field from a zod-style issue list (`links.1` → `links`). */
function errorsFromIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): PressErrors {
  const errors: PressErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "") as PressField;
    if (FIELDS.includes(key) && !errors[key]) {
      errors[key] = key === "links" && issue.path.length > 1 ? "Links must start with http:// or https://" : issue.message;
    }
  }
  return errors;
}

/**
 * Every problem with the form. `needsPledge` = the pledge step is part of this flow (apply, or
 * completing a pass that was never signed). `displayName` = what the signature must match.
 */
export function validate(values: PressPassValues, { needsPledge, displayName }: { needsPledge: boolean; displayName: string }): PressErrors {
  const input = toApplyInput(values);
  const parsed = pressPassApplySchema.safeParse(needsPledge ? input : { ...input, pledgeSignature: displayName || "-", acceptPledge: true });
  const errors = parsed.success ? {} : errorsFromIssues(parsed.error.issues);
  if (values.languages.length === 0) errors.languages = "Pick at least one language";
  // The schema's object-level rules only run once every field parses, so check the outlet and the ID number here too.
  if (values.reporterType === "staff" && !values.outlet.trim()) errors.outlet ??= "Name the news outlet you work for";
  if (values.idType === "aadhaar") {
    // A new number is checked in full here (the server only ever sees its last 4 digits); a saved one stays as it is.
    if (values.idNumber.trim() && !isMaskedAadhaar(values.idNumber) && !isValidAadhaar(values.idNumber)) {
      errors.idNumber = "That isn't a valid 12-digit Aadhaar number";
    } else if (!values.aadhaarConsent) {
      errors.idNumber ??= "Tick the box to agree to share your Aadhaar for verification";
    }
  } else if (values.idType && values.idNumber.trim() && !isValidIdNumber(values.idType, values.idNumber)) {
    errors.idNumber ??= `That doesn't look like a ${PRESS_ID_TYPE_LABELS[values.idType]} number`;
  }
  if (needsPledge) {
    if (!values.pledgeSignature.trim()) errors.pledgeSignature = "Type your name to sign the pledge";
    else if (!signatureMatches(values.pledgeSignature, displayName)) {
      errors.pledgeSignature = "Type your display name exactly as it appears on your profile";
    }
    if (!values.acceptPledge) errors.acceptPledge = "You must accept the Reporter Pledge";
  } else {
    delete errors.pledgeSignature;
    delete errors.acceptPledge;
  }
  return errors;
}

export function errorsForStep(errors: PressErrors, step: number): PressErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => STEP_OF[key as PressField] === step)) as PressErrors;
}

/** Maps the API's `fields` (keys like `links.0`) onto form fields. */
export function errorsFromApi(fields: Record<string, string> | undefined): PressErrors {
  if (!fields) return {};
  return errorsFromIssues(Object.entries(fields).map(([path, message]) => ({ path: path.split("."), message })));
}

export function firstStepWithError(errors: PressErrors): number | null {
  const steps = Object.keys(errors).map((key) => STEP_OF[key as PressField]);
  return steps.length ? Math.min(...steps) : null;
}

export const LIMITS = PRESS_PASS_LIMITS;
