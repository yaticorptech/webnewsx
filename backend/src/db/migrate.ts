import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fromBackendRoot } from "../lib/paths.js";

/** Applies backend/drizzle/*.sql to the given database (idempotent). */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: fromBackendRoot("drizzle") });
  } finally {
    await client.end({ timeout: 5 });
  }
}
