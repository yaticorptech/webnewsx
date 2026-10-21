/**
 * Creates the database named in DATABASE_URL if it does not exist (and nothing else — it never
 * touches other databases on the server). Connects to the "postgres" maintenance database with
 * the same credentials.
 *
 *   npm run db:create
 */
import postgres from "postgres";
import { databaseName, databaseUrl } from "./lib.js";

async function main(): Promise<void> {
  const url = databaseUrl();
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(name)) throw new Error(`Refusing to create a database with an unusual name: ${name}`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await client`select 1 from pg_database where datname = ${name}`;
    if (rows.length > 0) {
      console.log(`[db:create] ${databaseName(url)} already exists`);
      return;
    }
    await client.unsafe(`create database "${name}"`);
    console.log(`[db:create] created ${databaseName(url)}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("[db:create] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
