import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { pressPass, user, type PressPassRecord, type UserRecord } from "../db/schema.js";
import { ApiError, isUniqueViolation, validationError } from "../lib/errors.js";
import {
  EXPERIENCE_LABELS,
  EXPERIENCE_VALUES,
  INDIAN_REGIONS,
  KARNATAKA_DISTRICTS,
  PRESS_ID_HINTS,
  PRESS_ID_TYPE_LABELS,
  PRESS_ID_TYPE_VALUES,
  PRESS_LANGUAGE_LABELS,
  PRESS_LANGUAGE_VALUES,
  PRESS_PASS_LIMITS,
  PRESS_PLEDGE,
  REPORTER_TYPE_HINTS,
  REPORTER_TYPE_LABELS,
  REPORTER_TYPE_VALUES,
  TRAINEE_APPROVALS_TO_VERIFY,
  regionName,
  type PressPass,
  type PressPassOptions,
  type PressLanguage,
  type PressPassSummary,
  type ProfilePress,
  type ReporterLevel,
  type pressPassApplySchema,
  type pressPassUpdateSchema,
} from "../shared/contracts.js";
import type { z } from "zod";

export const PRESS_PASS_OPTIONS: PressPassOptions = {
  reporterTypes: REPORTER_TYPE_VALUES.map((value) => ({ value, label: REPORTER_TYPE_LABELS[value], hint: REPORTER_TYPE_HINTS[value] })),
  idTypes: PRESS_ID_TYPE_VALUES.map((value) => ({ value, label: PRESS_ID_TYPE_LABELS[value], hint: PRESS_ID_HINTS[value] })),
  experience: EXPERIENCE_VALUES.map((value) => ({ value, label: EXPERIENCE_LABELS[value] })),
  languages: PRESS_LANGUAGE_VALUES.map((value) => ({ value, label: PRESS_LANGUAGE_LABELS[value] })),
  regions: [...INDIAN_REGIONS],
  districts: { KA: KARNATAKA_DISTRICTS },
  pledge: PRESS_PLEDGE,
  limits: PRESS_PASS_LIMITS,
};

type HolderFields = Pick<UserRecord, "id" | "username" | "name" | "image">;

/**
 * Personal details, verification details, region and a signed pledge (passes migrated, or issued before some of these
 * were asked — personal details since 2026-10-07 — lack some).
 */
/**
 * A pass is complete once its application is: mobile, reporter type, experience, region and the signed pledge. The
 * personal details asked since 2026-10-07 (legal name, date of birth, address, ID) are part of every new application
 * but don't make an already-issued pass incomplete (owner 2026-10-09: "her Press Pass is already done" — no more
 * "Complete your Press Pass" for holders who applied before they were asked; they can add them under Edit details).
 */
export function isPassComplete(pass: Pick<PressPassRecord, "mobile" | "reporterType" | "experience" | "state" | "pledgeSignedAt">): boolean {
  return Boolean(pass.mobile && pass.reporterType && pass.experience && pass.state && pass.pledgeSignedAt);
}

export function toPassSummary(pass: PressPassRecord): PressPassSummary {
  return {
    passNumber: pass.passNumber,
    level: pass.level,
    status: pass.revokedAt ? "revoked" : "active",
    approvedCount: pass.approvedCount,
    complete: isPassComplete(pass),
  };
}

export function toPressPass(pass: PressPassRecord, holder: HolderFields): PressPass {
  return {
    ...toPassSummary(pass),
    mobile: pass.mobile,
    legalName: pass.legalName,
    dateOfBirth: pass.dateOfBirth,
    address: pass.address,
    pincode: pass.pincode,
    idType: pass.idType,
    idNumber: pass.idNumber,
    reporterType: pass.reporterType,
    outlet: pass.outlet,
    experience: pass.experience,
    state: pass.state,
    stateName: regionName(pass.state),
    district: pass.district,
    city: pass.city,
    languages: pass.languages,
    about: pass.about,
    links: pass.links,
    pledgeSignedAt: pass.pledgeSignedAt?.toISOString() ?? null,
    pledgeSignature: pass.pledgeSignature,
    approvalsToVerify: TRAINEE_APPROVALS_TO_VERIFY,
    issuedAt: pass.issuedAt.toISOString(),
    revokedAt: pass.revokedAt?.toISOString() ?? null,
    holder: { id: holder.id, username: holder.username ?? "", name: holder.name, image: holder.image },
  };
}

export function toProfilePress(pass: PressPassRecord): ProfilePress {
  return {
    level: pass.level,
    state: pass.state,
    stateName: regionName(pass.state),
    district: pass.district,
    city: pass.city,
    languages: pass.languages,
  };
}

export async function findPressPass(userId: string, executor: Executor = db): Promise<PressPassRecord | null> {
  const [row] = await executor.select().from(pressPass).where(eq(pressPass.userId, userId)).limit(1);
  return row ?? null;
}

/** Active (not revoked) pass or null. */
export async function findActivePass(userId: string, executor: Executor = db): Promise<PressPassRecord | null> {
  const [row] = await executor
    .select()
    .from(pressPass)
    .where(and(eq(pressPass.userId, userId), isNull(pressPass.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** `WN-<REGION>-<6 digits>`; the caller retries on the (unlikely) unique violation. */
export function newPassNumber(region: string | null): string {
  return `WN-${region ?? "IN"}-${randomInt(100_000, 1_000_000)}`;
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

function signatureError(): ApiError {
  return validationError({ pledgeSignature: "Type your display name exactly as it appears on your profile" });
}

function mobileTakenError(): ApiError {
  return validationError({ mobile: "This mobile number is already on another Press Pass" });
}

function idTakenError(): ApiError {
  return validationError({ idNumber: "This ID is already on another Press Pass" });
}

/** A pass's languages are also the languages its holder reads (owner 2026-10-05: one list) — "Other" isn't a feed. */
const readingLanguages = (languages: PressLanguage[]) => languages.filter((code) => code !== "other");

/** The personal + verification + region + about columns both the application and later edits write. */
function passDetails(input: PressPassApplyData | PressPassUpdateData) {
  return {
    legalName: input.legalName,
    dateOfBirth: input.dateOfBirth,
    address: input.address,
    pincode: input.pincode,
    idType: input.idType,
    idNumber: input.idNumber,
    mobile: input.mobile,
    reporterType: input.reporterType,
    outlet: input.reporterType === "citizen" ? null : input.outlet,
    experience: input.experience,
    state: input.state,
    district: input.district,
    city: input.city,
    languages: input.languages,
    about: input.about,
    links: input.links,
  };
}

export type PressPassApplyData = z.output<typeof pressPassApplySchema>;
export type PressPassUpdateData = z.output<typeof pressPassUpdateSchema>;

/**
 * Issues a Press Pass instantly (SPEC §3.11): readers only; the pass starts at Trainee and the account
 * becomes a Reporter. A pass the Editor Desk revoked can't be re-issued by its holder.
 */
export async function applyForPressPass(holder: HolderFields & { role: string }, input: PressPassApplyData): Promise<PressPassRecord> {
  if (holder.role === "admin") throw new ApiError(409, "already_editor_desk", "Editor Desk accounts can already publish");
  if (!sameName(input.pledgeSignature, holder.name)) throw signatureError();
  const existing = await findPressPass(holder.id);
  if (existing && !existing.revokedAt) throw new ApiError(409, "already_reporter", "You already have a Press Pass");
  if (existing?.revokedAt) {
    throw new ApiError(403, "press_pass_revoked", "Your Press Pass was revoked by the Editor Desk. Contact the WebNEWS team to have it reinstated.");
  }

  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(pressPass)
          .values({
            userId: holder.id,
            passNumber: newPassNumber(input.state),
            ...passDetails(input),
            pledgeSignedAt: now,
            pledgeSignature: input.pledgeSignature,
            level: "trainee",
            approvedCount: 0,
            issuedAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new ApiError(500, "internal_error", "Press Pass could not be issued");
        await tx
          .update(user)
          .set({ role: "reporter", reporterLevel: "trainee", preferredLanguages: readingLanguages(input.languages) })
          .where(eq(user.id, holder.id));
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, "press_pass_pass_number_unique")) continue;
      if (isUniqueViolation(error, "press_pass_pkey")) throw new ApiError(409, "already_reporter", "You already have a Press Pass");
      if (isUniqueViolation(error, "press_pass_mobile_unique")) throw mobileTakenError();
      if (isUniqueViolation(error, "press_pass_id_unique")) throw idTakenError();
      throw error;
    }
  }
  throw new ApiError(500, "internal_error", "Could not generate a unique pass number");
}

/** Holder edits (verification details, region, languages, about, links; signs the pledge once if it isn't signed yet). */
export async function updatePressPass(holder: HolderFields, input: PressPassUpdateData): Promise<PressPassRecord> {
  const existing = await findActivePass(holder.id);
  if (!existing) throw new ApiError(404, "not_found", "You don't have an active Press Pass");
  const changes: Partial<typeof pressPass.$inferInsert> = { ...passDetails(input), updatedAt: new Date() };
  if (!existing.pledgeSignedAt) {
    if (!input.acceptPledge || !input.pledgeSignature) {
      throw validationError({ pledgeSignature: "Sign the Reporter Pledge to complete your Press Pass" });
    }
    if (!sameName(input.pledgeSignature, holder.name)) throw signatureError();
    changes.pledgeSignedAt = new Date();
    changes.pledgeSignature = input.pledgeSignature;
  }
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.update(pressPass).set(changes).where(eq(pressPass.userId, holder.id)).returning();
      if (!row) throw new ApiError(404, "not_found", "You don't have an active Press Pass");
      await tx.update(user).set({ preferredLanguages: readingLanguages(input.languages) }).where(eq(user.id, holder.id));
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, "press_pass_mobile_unique")) throw mobileTakenError();
    if (isUniqueViolation(error, "press_pass_id_unique")) throw idTakenError();
    throw error;
  }
}

/** Sets the pass level and mirrors it on the user row (the one place both change together). */
export async function setPassLevel(executor: Executor, userId: string, level: ReporterLevel, resetApprovals: boolean): Promise<void> {
  await executor
    .update(pressPass)
    .set({ level, updatedAt: new Date(), ...(resetApprovals ? { approvedCount: 0 } : {}) })
    .where(eq(pressPass.userId, userId));
  await executor.update(user).set({ reporterLevel: level }).where(eq(user.id, userId));
}
