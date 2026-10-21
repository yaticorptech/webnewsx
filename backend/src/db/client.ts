import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import { schema } from "./schema.js";

/** Shared connection pool for queries (postgres.js). */
export const sql = postgres(env.DATABASE_URL, {
  max: env.isTest ? 5 : 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle({ client: sql, schema });

export type Database = typeof db;
/** A transaction handle (same query API as `db`). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the pool or an open transaction. */
export type Executor = Database | Transaction;

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
