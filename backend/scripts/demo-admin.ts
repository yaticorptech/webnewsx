import { generateRandomString, hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { DEMO_EMAIL_DOMAIN } from "../src/db/purge.js";
import { account, session, user } from "../src/db/schema.js";
import { DEMO_PASSWORD } from "./seed-data.js";
import { DEMO_ADMIN } from "./seed-roles-data.js";

export const DEMO_ADMIN_EMAIL = `${DEMO_ADMIN.username}@${DEMO_EMAIL_DOMAIN}`;

/**
 * The demo Editor Desk never keeps the shared demo password (it is printed in the README): it gets its own random
 * password, shown once by whoever rotates it. Rotates when the account still uses the shared password, or always
 * with `force`. Signs the account out everywhere. Returns the new password, or null when nothing changed / no account.
 */
export async function rotateDemoAdminPassword(force = false): Promise<string | null> {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_ADMIN_EMAIL)).limit(1);
  if (!admin) return null;
  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, admin.id), eq(account.providerId, "credential")))
    .limit(1);
  if (!credential) return null;
  const shared = credential.password ? await verifyPassword({ hash: credential.password, password: DEMO_PASSWORD }) : false;
  if (!shared && !force) return null;
  const password = generateRandomString(20, "a-z", "A-Z", "0-9");
  await db.update(account).set({ password: await hashPassword(password), updatedAt: new Date() }).where(eq(account.id, credential.id));
  await db.delete(session).where(eq(session.userId, admin.id));
  return password;
}
