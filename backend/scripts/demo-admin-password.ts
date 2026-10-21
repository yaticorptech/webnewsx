/**
 * Gives the demo Editor Desk account (admin.demo@demo.webnews.local) a new random password and prints it once.
 * Local development only — the demo accounts don't exist anywhere else.
 *
 *   npm --prefix backend run db:demo-admin-password
 */
import { closeDatabase } from "../src/db/client.js";
import { DEMO_ADMIN_EMAIL, rotateDemoAdminPassword } from "./demo-admin.js";
import { databaseName, databaseUrl, demoSeedRefusal } from "./lib.js";

const refusal = demoSeedRefusal();
if (refusal) {
  console.error(`[demo-admin] refusing: ${refusal}. Demo accounts are for local development only.`);
  process.exit(1);
}
console.log(`[demo-admin] ${databaseName(databaseUrl())}`);
try {
  const password = await rotateDemoAdminPassword(true);
  if (password) {
    console.log(`[demo-admin] ${DEMO_ADMIN_EMAIL} — new password (shown once): ${password}`);
  } else {
    console.log(`[demo-admin] no ${DEMO_ADMIN_EMAIL} account — run \`npm --prefix backend run db:seed\` first.`);
  }
} catch (error) {
  console.error("[demo-admin] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
