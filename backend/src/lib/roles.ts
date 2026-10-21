import { env } from "../env.js";
import { REPORTER_LEVEL_VALUES, ROLE_VALUES, canPublish as roleCanPublish, publishesToReview, type ReporterLevel, type Role } from "../shared/contracts.js";
import type { Viewer } from "../types.js";

/**
 * ADMIN_EMAILS (lower-cased). A Set so tests can register their own fixture admins in-process.
 * Being listed is not enough: the address must also be verified (lib/admin-emails.ts).
 */
export const adminEmails = new Set<string>(env.adminEmails);

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails.has((email as string).trim().toLowerCase());
}

export function toRole(value: unknown): Role {
  return (ROLE_VALUES as readonly unknown[]).includes(value) ? (value as Role) : "reader";
}

export function toReporterLevel(value: unknown): ReporterLevel | null {
  return (REPORTER_LEVEL_VALUES as readonly unknown[]).includes(value) ? (value as ReporterLevel) : null;
}

/** Reporters and the Editor Desk can write stories; readers need a Press Pass first. */
export function canPublish(viewer: Pick<Viewer, "role">): boolean {
  return roleCanPublish(viewer);
}

/** Trainee reporters go through the Review Desk; Verified reporters and admins publish instantly. */
export function needsReview(viewer: Pick<Viewer, "role" | "reporterLevel">): boolean {
  return publishesToReview(viewer);
}
