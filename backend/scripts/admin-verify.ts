/**
 * Confirms an account's email address as the person who runs the server (SPEC §3.11, ADMIN_EMAILS).
 * Listed ADMIN_EMAILS addresses become the Editor Desk only once verified: "Continue with Google" verifies
 * automatically; a password account needs this command once.
 *
 *   npm --prefix backend run admin:verify -- admin@webnews.in
 *
 * The account must already exist (sign up first). Listed addresses are promoted immediately (audit entry
 * "user.auto_admin"); other addresses are only marked verified.
 */
import { closeDatabase } from "../src/db/client.js";
import { verifyEmailAddress } from "../src/lib/admin-emails.js";
import { databaseName, databaseUrl } from "./lib.js";

const email = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("-"))
  ?.trim()
  .toLowerCase();

if (!email || !email.includes("@")) {
  console.error("Usage: npm --prefix backend run admin:verify -- <email>");
  process.exit(1);
}

console.log(`[admin:verify] ${databaseName(databaseUrl())}`);
try {
  const result = await verifyEmailAddress(email);
  if (!result.found) {
    console.error(`[admin:verify] no account uses ${email} — sign up with it first, then run this again.`);
    process.exitCode = 1;
  } else if (result.promoted) {
    console.log(`[admin:verify] ${email} is verified and is now the Editor Desk (listed in ADMIN_EMAILS).`);
  } else if (result.listed) {
    console.log(`[admin:verify] ${email} is verified and already on the Editor Desk.`);
  } else {
    console.log(`[admin:verify] ${email} is verified. It is not listed in ADMIN_EMAILS, so its role did not change.`);
  }
} catch (error) {
  console.error("[admin:verify] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
