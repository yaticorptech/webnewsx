import { and, eq } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { account } from "../db/schema.js";

/*
 * Editor Desk sign-in (owner rule 2026-09-25; Google allowed 2026-10-30): the admin panel opens only after the admin's
 * email + password are typed on the Log in page or "Continue with Google" — never through a link or a remembered session.
 *  - An admin account signs in with email + password or Google only; any other sign-in is refused (`ADMIN_PASSWORD_ONLY`).
 *  - That sign-in is never remembered: its cookie ends with the browser and the session after DESK_SESSION_HOURS.
 *  - Becoming an admin signs the account out everywhere, so no session from before the promotion opens the Desk.
 */

/** The only Better Auth endpoint that may create an admin session (the Log in page's email + password form). */
export const DESK_SIGN_IN_PATH = "/sign-in/email";

export const DESK_SESSION_HOURS = 12;
const DESK_SESSION_MS = DESK_SESSION_HOURS * 60 * 60 * 1000;

/** Better Auth error code for an admin account signing in any other way than email + password. */
export const ADMIN_PASSWORD_ONLY = "ADMIN_PASSWORD_ONLY";
export const ADMIN_PASSWORD_ONLY_MESSAGE = "Editor Desk accounts log in with their email and password on the Log in page.";

/** A new admin session's expiry: never later than DESK_SESSION_HOURS from now. */
export function deskSessionExpiry(expiresAt: Date, now = Date.now()): Date {
  return new Date(Math.min(expiresAt.getTime(), now + DESK_SESSION_MS));
}

/** An admin session older than DESK_SESSION_HOURS no longer counts (whatever its cookie or expiry says). */
export function deskSessionOver(createdAt: Date, now = Date.now()): boolean {
  return createdAt.getTime() + DESK_SESSION_MS <= now;
}

/** Whether the account can sign in with email + password (Google-only accounts can't reach the Desk). */
export async function hasPasswordLogin(tx: Executor, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return Boolean(row);
}
