/**
 * Gives an Editor Desk (admin) account a new password — random, or the one given — prints it once and signs its
 * sessions out: for when the owner has lost the admin password (passwords are stored hashed; nobody can read the old one
 * back) or wants to choose one.
 *
 *   npm --prefix backend run db:admin-password -- admin@webnews.in
 *   npm --prefix backend run db:admin-password -- admin@webnews.in 'Chosen@Password1'
 */
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { account, session, user } from "../src/db/schema.js";
import { databaseName, databaseUrl } from "./lib.js";

const email = process.argv[2]?.trim().toLowerCase();
const chosen = process.argv[3];
if (!email) {
  console.error("[admin-password] usage: npm --prefix backend run db:admin-password -- <admin email> [new password]");
  process.exit(1);
}
if (chosen !== undefined && chosen.length < 8) {
  console.error("[admin-password] the new password must be at least 8 characters");
  process.exit(1);
}
console.log(`[admin-password] ${databaseName(databaseUrl())}`);
try {
  const [admin] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
  if (!admin) throw new Error(`no account for ${email}`);
  if (admin.role !== "admin") throw new Error(`${email} isn't an Editor Desk (admin) account`);
  // Letters + digits, 4 groups: meets the "Good" password rule and is easy to type.
  const password = chosen ?? [0, 1, 2, 3].map(() => generateRandomString(5, "a-z", "A-Z", "0-9")).join("-");
  const updated = await db
    .update(account)
    .set({ password: await hashPassword(password), updatedAt: new Date() })
    .where(and(eq(account.userId, admin.id), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (updated.length === 0) throw new Error(`${email} has no email + password login`);
  await db.delete(session).where(eq(session.userId, admin.id));
  console.log(chosen ? `[admin-password] ${email} — password changed` : `[admin-password] ${email} — new password (shown once): ${password}`);
} catch (error) {
  console.error("[admin-password] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
