import { existsSync } from "node:fs";
import { fromBackendRoot } from "../src/lib/paths.js";

/** Loads backend/.env (real env wins) — for scripts that must not import src/env.ts eagerly. */
export function loadDotEnv(): void {
  const file = fromBackendRoot(".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** DATABASE_URL — the one and only database (there is no separate test database). */
export function databaseUrl(): string {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see backend/.env.example)");
  return url;
}

/** Database name from a postgres URL (for logs) — never prints credentials. */
export function databaseName(url: string): string {
  const parsed = new URL(url);
  return `${decodeURIComponent(parsed.pathname.replace(/^\//, ""))} @ ${parsed.hostname}:${parsed.port || "5432"}`;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Demo data (known demo logins, a demo Editor Desk) must never be created outside local development:
 * returns why seeding is refused (NODE_ENV=production, or FRONTEND_URL not on this machine), or null when allowed.
 */
export function demoSeedRefusal(): string | null {
  loadDotEnv();
  if (process.env.NODE_ENV === "production") return "NODE_ENV is production";
  const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
  let host: string;
  try {
    host = new URL(frontend).hostname.toLowerCase();
  } catch {
    return "FRONTEND_URL is not a valid URL";
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) return null;
  return `FRONTEND_URL (${host}) is not localhost`;
}
