import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { account, pressPass, session, user } from "../db/schema.js";
import { writeAudit } from "./audit.js";
import { isAdminEmail } from "./roles.js";

/*
 * ADMIN_EMAILS (SPEC §3.11) — a listed address becomes the Editor Desk only once it is VERIFIED:
 *  - "Continue with Google" verifies it (Google's `email_verified`);
 *  - for a password account, whoever runs the server confirms it with `npm --prefix backend run admin:verify -- <email>`.
 * Email sign-up has no verification mail, so a bare sign-up with a listed address stays a Reader — otherwise
 * anyone who registered admin@… first would own the console.
 */

type PromotionCandidate = { id: string; email: string; emailVerified: boolean; role: string; username: string | null };

/** Listed in ADMIN_EMAILS and verified. */
export function qualifiesForEditorDesk(email: string | null | undefined, emailVerified: boolean | null | undefined): boolean {
  return emailVerified === true && isAdminEmail(email);
}

/** Promotes a qualifying account to admin (with the automatic audit entry). Returns true when it changed. */
export async function promoteListedAdmin(record: PromotionCandidate, from: string): Promise<boolean> {
  if (record.role === "admin" || !qualifiesForEditorDesk(record.email, record.emailVerified)) return false;
  await db.transaction(async (tx) => {
    // The Editor Desk has Verified-reporter standing (SPEC §3.11): badge beside the name, instant publishing.
    await tx.update(user).set({ role: "admin", reporterLevel: "verified" }).where(eq(user.id, record.id));
    await tx
      .update(pressPass)
      .set({ level: "verified", updatedAt: new Date() })
      .where(and(eq(pressPass.userId, record.id), isNull(pressPass.revokedAt)));
    // Every session it had was a Reader's; the Desk opens only after a typed email + password sign-in (lib/desk-sign-in.ts).
    await tx.delete(session).where(eq(session.userId, record.id));
    await writeAudit(tx, {
      actorId: null,
      action: "user.auto_admin",
      targetType: "user",
      targetId: record.id,
      targetLabel: record.username ?? record.email,
      meta: { from, via: "ADMIN_EMAILS" },
    });
  });
  return true;
}

export type VerifyEmailResult = { found: boolean; listed: boolean; promoted: boolean };

/**
 * Operator command: marks an existing account's address as verified (the person running the server vouches for
 * it) and, when it is listed in ADMIN_EMAILS, promotes it right away.
 */
export async function verifyEmailAddress(email: string): Promise<VerifyEmailResult> {
  const normalized = email.trim().toLowerCase();
  const listed = isAdminEmail(normalized);
  const [record] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified, role: user.role, username: user.username })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalized}`)
    .limit(1);
  if (!record) return { found: false, listed, promoted: false };
  if (!record.emailVerified) await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, record.id));
  const promoted = await promoteListedAdmin({ ...record, emailVerified: true }, record.role);
  return { found: true, listed, promoted };
}

/**
 * A VERIFIED Google sign-in for an address whose local account was never verified claims that account: nobody
 * proved they owned the address when it was registered, so its password (maybe set by a squatter) is removed,
 * every session is revoked and the address is marked verified. Better Auth then links Google to the account as
 * usual — without this it refuses (`account_not_linked`) and the real owner could never sign in.
 */
export async function claimUnverifiedAccount(email: string | null | undefined, emailVerified: boolean | null | undefined): Promise<boolean> {
  if (!email || emailVerified !== true) return false;
  const normalized = email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalized}`)
      .for("update")
      .limit(1);
    if (!record || record.emailVerified) return false;
    await tx.delete(account).where(and(eq(account.userId, record.id), eq(account.providerId, "credential")));
    await tx.delete(session).where(eq(session.userId, record.id));
    await tx.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, record.id));
    return true;
  });
}
