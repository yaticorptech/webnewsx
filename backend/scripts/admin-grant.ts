/**
 * Makes an existing account the Editor Desk in one step, for an address listed in ADMIN_EMAILS (owner 2026-10-30):
 * marks its email verified, gives it an email + password login (added when it only had Google / WhatsApp; the
 * password is random and printed once, or the one given) and promotes it. Its sessions are signed out; it then signs
 * in at /login?desk=1. Production has no reset email, so this is how a Google-made account gets its Desk password.
 *
 *   npm --prefix backend run admin:grant -- someone@gmail.com
 *   npm --prefix backend run admin:grant -- someone@gmail.com 'Chosen@Password1'
 *   (on the server: node dist/scripts/admin-grant.js someone@gmail.com)
 */
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { account, session, user } from "../src/db/schema.js";
import { verifyEmailAddress } from "../src/lib/admin-emails.js";
import { isAdminEmail } from "../src/lib/roles.js";
import { databaseName, databaseUrl } from "./lib.js";

const email = process.argv[2]?.trim().toLowerCase();
const chosen = process.argv[3];
if (!email || !email.includes("@")) {
  console.error("[admin-grant] usage: npm --prefix backend run admin:grant -- <email> [new password]");
  process.exit(1);
}
if (chosen !== undefined && chosen.length < 8) {
  console.error("[admin-grant] the new password must be at least 8 characters");
  process.exit(1);
}
console.log(`[admin-grant] ${databaseName(databaseUrl())}`);
try {
  if (!isAdminEmail(email)) throw new Error(`${email} isn't listed in ADMIN_EMAILS — add it there first`);
  const [record] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${email}`).limit(1);
  if (!record) throw new Error(`no account uses ${email} — sign in once with Google (or sign up) first`);

  // Letters + digits, 4 groups: meets the "Good" password rule and is easy to type.
  const password = chosen ?? [0, 1, 2, 3].map(() => generateRandomString(5, "a-z", "A-Z", "0-9")).join("-");
  const hash = await hashPassword(password);
  const updated = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, record.id), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (updated.length === 0) {
    await db.insert(account).values({
      id: generateRandomString(32, "a-z", "A-Z", "0-9"),
      accountId: record.id,
      providerId: "credential",
      userId: record.id,
      password: hash,
      updatedAt: new Date(),
    });
  }

  await verifyEmailAddress(email);
  await db.delete(session).where(eq(session.userId, record.id));
  console.log(
    chosen
      ? `[admin-grant] ${email} is the Editor Desk — sign in at /login?desk=1 with the password you chose`
      : `[admin-grant] ${email} is the Editor Desk — sign in at /login?desk=1 with this password (shown once): ${password}`,
  );
} catch (error) {
  console.error("[admin-grant] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
