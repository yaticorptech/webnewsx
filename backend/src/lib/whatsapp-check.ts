import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { verification } from "../db/schema.js";

/*
 * A WhatsApp number check (routes/phone-auth.ts): a `verification` row whose identifier is "whatsapp:<code sent>" and
 * whose value says which number it's for and whether WhatsApp confirmed it.
 */

export const CHECK_PREFIX = "whatsapp:";

export type CheckStatus = "pending" | "verified" | "wrong_number";
export type CheckValue = { phone: string; status: CheckStatus };

export async function findCheck(id: string) {
  const [row] = await db
    .select()
    .from(verification)
    .where(and(eq(verification.id, id), gt(verification.expiresAt, new Date())))
    .limit(1);
  if (!row?.identifier.startsWith(CHECK_PREFIX)) return null;
  return { row, value: JSON.parse(row.value) as CheckValue };
}

export async function setStatus(id: string, value: CheckValue, status: CheckStatus) {
  await db
    .update(verification)
    .set({ value: JSON.stringify({ ...value, status }) })
    .where(eq(verification.id, id));
}

/** Better Auth's phone verify (auth.ts verifyOTP) accepts a check id only when WhatsApp confirmed it for that number. */
export async function consumeWhatsAppCheck(phoneNumber: string, id: string): Promise<boolean> {
  const check = await findCheck(id).catch(() => null);
  if (!check || check.value.status !== "verified" || check.value.phone !== phoneNumber) return false;
  await db.delete(verification).where(eq(verification.id, id));
  return true;
}
