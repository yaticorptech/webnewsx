import { existsSync } from "node:fs";
import { runMigrations } from "../src/db/migrate.js";
import { fromBackendRoot } from "../src/lib/paths.js";

/**
 * Runs once before all test files: applies pending migrations to DATABASE_URL (idempotent, the same
 * as `npm run db:migrate`). No data is created or removed here.
 */
export default async function setup(): Promise<void> {
  const envFile = fromBackendRoot(".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  await runMigrations(url);
}
