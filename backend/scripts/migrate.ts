/**
 * Applies the SQL migrations in backend/drizzle to DATABASE_URL using drizzle-orm's postgres-js
 * migrator (idempotent). Works in production/Docker (compiled to dist/scripts/migrate.js) without drizzle-kit.
 *
 *   npm run db:migrate
 */
import { runMigrations } from "../src/db/migrate.js";
import { databaseName, databaseUrl } from "./lib.js";

const url = databaseUrl();
console.log(`[migrate] applying migrations to ${databaseName(url)} …`);
try {
  await runMigrations(url);
  console.log("[migrate] done");
} catch (error) {
  console.error("[migrate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
