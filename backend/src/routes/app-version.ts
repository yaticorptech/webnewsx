import { Hono } from "hono";
import { env } from "../env.js";
import type { AppVersionInfo } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/**
 * GET /api/app/android (owner 2026-11-02) — the newest Android app build, for the "Update available" popup the app
 * shows on opening (components/layout/app-update.tsx). Set with ANDROID_APP_* on the backend when a new APK is out.
 */
export function appVersionRoutes() {
  const app = new Hono<AppEnv>();
  app.get("/android", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    const body: AppVersionInfo = {
      latestBuild: env.ANDROID_APP_BUILD ?? null,
      latestVersion: env.ANDROID_APP_VERSION ?? null,
      minBuild: env.ANDROID_APP_MIN_BUILD ?? null,
      notes: env.ANDROID_APP_NOTES ?? null,
    };
    return c.json(body);
  });
  return app;
}
