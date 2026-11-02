import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/client.js";
import { siteSetting } from "../db/schema.js";
import { env } from "../env.js";

/**
 * Demo engagement (owner 2026-11-02): generated views / likes / shares for testing the UI on local development and
 * staging. Real counts are never touched; the demo numbers live in their own columns and are added to the shown counts
 * only while demo mode is on.
 *
 * The public site can never turn it on — decided here on the server, not in the browser: demo mode is refused when the
 * site's address is a public WebNewsX domain, and in production unless the deployment explicitly sets
 * ALLOW_DEMO_ENGAGEMENT=1 (a staging deployment). The Editor Desk switch can't override either.
 *
 * Exception (owner 2026-11-02, before launch with no real readers yet): ALLOW_DEMO_ENGAGEMENT=public allows it on the
 * public site too. Remove that setting (and Reset in the Desk) once real readers arrive.
 */
const PUBLIC_HOSTS = new Set(["webnewsx.com", "www.webnewsx.com", "webnews.in", "www.webnews.in"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether a deployment may use demo mode at all (pure, for tests): never on a public domain. */
export function demoAllowedFor(frontendUrl: string, isProduction: boolean, allowFlag: string | undefined): boolean {
  const host = hostOf(frontendUrl);
  if (!host) return false;
  if (allowFlag === "public") return true;
  if (PUBLIC_HOSTS.has(host)) return false;
  if (isProduction && allowFlag !== "1") return false;
  return true;
}

export const DEMO_ALLOWED = demoAllowedFor(env.FRONTEND_URL, env.isProduction, process.env.ALLOW_DEMO_ENGAGEMENT);
export const DEMO_SETTING_KEY = "demo_engagement";
export type DemoSetting = { enabled: boolean; generatedAt: string | null; stories: number; accounts: number };

const REFRESH_MS = 15_000;
let cached: DemoSetting = { enabled: false, generatedAt: null, stories: 0, accounts: 0 };
let fetchedAt = 0;

export async function readDemoSetting(): Promise<DemoSetting> {
  const [row] = await db.select({ value: siteSetting.value }).from(siteSetting).where(eq(siteSetting.key, DEMO_SETTING_KEY)).limit(1);
  const value = (row?.value ?? {}) as Partial<DemoSetting>;
  cached = { enabled: Boolean(value.enabled), generatedAt: value.generatedAt ?? null, stories: Number(value.stories ?? 0), accounts: Number(value.accounts ?? 0) };
  fetchedAt = Date.now();
  return cached;
}

/** Demo numbers are shown right now (allowed here, and switched on). Never true on the public site. */
export function demoActive(): boolean {
  if (!DEMO_ALLOWED) return false;
  if (Date.now() - fetchedAt > REFRESH_MS) void readDemoSetting().catch(() => undefined);
  return cached.enabled;
}

/** A shown count in SQL: the real column, plus the demo column while demo mode is on. */
export function shownCount(real: AnyPgColumn, demo: AnyPgColumn): SQL<number> | AnyPgColumn {
  return demoActive() ? sql<number>`(${real} + ${demo})`.mapWith(Number) : real;
}

/** The same in raw SQL for queries written by hand (`a.view_count` → `(a.view_count + a.demo_views)`). */
export function shownCountRaw(realExpr: string, demoExpr: string): SQL {
  return sql.raw(demoActive() ? `(${realExpr} + ${demoExpr})` : realExpr);
}

/**
 * A shown follower count in SQL: `count` (the real follower count of the account `userId`), plus that account's demo
 * followers while demo mode is on. Badges and other rules keep using the real count.
 */
export function shownFollowers(count: SQL, userId: SQL | string): SQL<number> {
  if (!demoActive()) return sql<number>`${count}`.mapWith(Number);
  return sql<number>`(${count} + coalesce((select du.demo_followers from "user" du where du.id = ${userId}), 0))`.mapWith(Number);
}

/** A shown count from numbers already loaded. */
export const plusDemo = (real: number, demo: number | null | undefined): number => (demoActive() ? real + (demo ?? 0) : real);

if (DEMO_ALLOWED) void readDemoSetting().catch(() => undefined);
