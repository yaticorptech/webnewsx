/**
 * Removes automated-test fixtures and everything they own (cascade), plus their uploaded files.
 * Only "@test.webnews.local" users can ever match; nothing else is touched.
 *
 *   npm run db:clean-test                          → every @test.webnews.local user (leftovers)
 *   npm run db:clean-test -- --prefix=e2e.qxkzvb.  → only one run's users ("e2e.qxkzvb.<random>@test.webnews.local")
 */
import { closeDatabase } from "../src/db/client.js";
import { TEST_EMAIL_DOMAIN, purgeUsers, type PurgeTarget } from "../src/db/purge.js";
import { fromBackendRoot } from "../src/lib/paths.js";
import { databaseName, databaseUrl } from "./lib.js";

const prefixArg = process.argv.slice(2).find((arg) => arg.startsWith("--prefix="));
const prefix = prefixArg?.slice("--prefix=".length).trim().toLowerCase();
const target: PurgeTarget = prefix ? { testEmailPrefix: prefix } : { emailDomains: [TEST_EMAIL_DOMAIN] };
const scope = prefix ? `${prefix}*@${TEST_EMAIL_DOMAIN}` : `@${TEST_EMAIL_DOMAIN}`;

console.log(`[clean-test] removing ${scope} users from ${databaseName(databaseUrl())} …`);
try {
  const result = await purgeUsers(target, { extraLocalDirs: [fromBackendRoot(".data/test-uploads")] });
  console.log(`[clean-test] removed ${result.users} test user(s) and ${result.articles} of their article(s)`);
} catch (error) {
  console.error("[clean-test] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
