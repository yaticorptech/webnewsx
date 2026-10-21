import {
  EXPERIENCE_LABELS,
  PRESS_LANGUAGE_LABELS,
  REPORTER_LEVEL_LABELS,
  REPORTER_TYPE_LABELS,
  regionName,
  type PressLanguage,
  type ReporterLevel,
  type ReporterType,
  type ReportingExperience,
} from "@/lib/shared/contracts";

/*
 * Display helpers shared by the Press Pass card, the application and the reporter profile.
 * Pure and deterministic (server + client render the same strings).
 */

/** Pass dates are printed in India time so the card reads the same on the server and in every browser. */
const issueDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** "24 SEP 2026" (fixed English month codes — ICU versions disagree on "Sep" vs "Sept"). */
export function passDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(issueDate.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day} ${MONTHS[Number(parts.month) - 1] ?? ""} ${parts.year}`;
}

/** "Staff reporter · The Harbor Ledger" · "Citizen journalist" · null before verification (Editor Desk only). */
export function reporterTypeLabel(press: { reporterType: ReporterType | null; outlet: string | null }): string | null {
  if (!press.reporterType) return null;
  const type = REPORTER_TYPE_LABELS[press.reporterType] ?? press.reporterType;
  return press.outlet ? `${type} · ${press.outlet}` : type;
}

export function experienceLabel(experience: ReportingExperience | null): string | null {
  return experience ? (EXPERIENCE_LABELS[experience] ?? experience) : null;
}

/** "+919845012345" → "+91 98450 12345". */
export function formatMobile(mobile: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(mobile);
  return match ? `+91 ${match[1]} ${match[2]}` : mobile;
}

export function languageLabels(languages: readonly PressLanguage[]): string[] {
  return languages.map((language) => PRESS_LANGUAGE_LABELS[language] ?? language);
}

/**
 * "Mangaluru, Karnataka" (the city, owner 2026-10-05) · "Mysuru, Karnataka" (older passes: the district) · "Karnataka" ·
 * null when the pass has no region yet (migrated passes).
 */
export function regionLabel(press: {
  state: string | null;
  stateName?: string | null;
  district: string | null;
  city?: string | null;
}): string | null {
  const place = press.city || press.district || null;
  const state = press.stateName ?? regionName(press.state);
  if (!state || press.state === "IN") return place;
  return place ? `${place}, ${state}` : state;
}

export function levelLabel(level: ReporterLevel): string {
  return REPORTER_LEVEL_LABELS[level];
}

/** Masked pass number for previews before it's issued: "WN-KA-••••••". */
export function previewPassNumber(state: string | null | undefined): string {
  return `WN-${state || "IN"}-••••••`;
}

/** Decorative barcode derived from the pass number (same number → same bars). */
export function barcodeBars(seed: string): { x: number; w: number }[] {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const char of seed.replace(/[^A-Z0-9]/gi, "") || "WEBNEWS") {
    const code = char.charCodeAt(0);
    for (let bit = 0; bit < 3; bit++) {
      const w = ((code >> bit) & 1) + 1;
      bars.push({ x, w });
      x += w + 1 + ((code >> (bit + 3)) & 1);
    }
  }
  return bars.map((bar) => ({ x: (bar.x / x) * 100, w: (bar.w / x) * 100 }));
}
