import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { request, type FullConfig } from "@playwright/test";

/**
 * Warms up the routes the suite visits so `next dev` compiles them before any test runs. Compiling a
 * route mid-test makes Turbopack push updates to every open page, which slows tests and adds dev-only noise.
 */
const WARM_PATHS = [
  "/api/health",
  "/",
  "/?tab=latest",
  "/?tab=following",
  "/category/sports",
  "/category/karnataka/mysuru",
  "/onboarding",
  "/trending",
  "/this/does-not-exist",
  "/a/warm-up-route",
  "/harbor.ledger",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/about",
  "/settings/profile",
  "/publish",
  "/publish/00000000-0000-4000-8000-000000000000",
  "/press-pass",
  "/newsroom",
  "/admin",
  "/admin/review",
  "/admin/flags",
  "/admin/people",
  "/admin/spotlight",
];

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  for (const path of WARM_PATHS) {
    try {
      await fetch(new URL(path, baseURL), { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    } catch {
      // Best effort: the tests themselves report real failures.
    }
  }
  const frontendDir = config.configFile ? dirname(config.configFile) : process.cwd();
  await createDesk(baseURL, resolve(frontendDir, "../backend"));
}

/**
 * The suite's Editor Desk fixture (SPEC §3.11): signs up `E2E_DESK_EMAIL` — listed in the e2e backend's
 * ADMIN_EMAILS by playwright.config.ts — and verifies the address the way an operator would
 * (`npm run admin:verify`; an unverified sign-up never becomes admin), which promotes it and signs it out; it then logs
 * in with email + password (the only way into the Desk) and onboards (the admin API needs a finished profile). Its session goes
 * to the workers through `E2E_DESK_STATE` (env set here is inherited by every worker).
 * The account is a `pw.<runTag>.…@test.webnews.local` fixture, removed by global teardown.
 */
async function createDesk(baseURL: string, backendDir: string): Promise<void> {
  const email = process.env.E2E_DESK_EMAIL;
  if (!email || process.env.E2E_DESK_STATE) return;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  try {
    const res = await api.post("/api/auth/sign-up/email", { data: { email, password: "Tidal-Clock-e2e-7", name: "" } });
    if (!res.ok()) return;
    execFileSync("npm", ["--prefix", backendDir, "run", "--silent", "admin:verify", "--", email], {
      env: { ...process.env, ADMIN_EMAILS: email },
      stdio: "inherit",
    });
    const signIn = await api.post("/api/auth/sign-in/email", { data: { email, password: "Tidal-Clock-e2e-7" } });
    if (!signIn.ok()) return;
    // The admin API also needs a finished profile (403 `onboarding_required` otherwise).
    const upload = await api.post("/api/upload", {
      multipart: { kind: "avatar", file: { name: "avatar.png", mimeType: "image/png", buffer: readFileSync(join(__dirname, "../../public/icons/icon-512.png")) } },
    });
    if (!upload.ok()) return;
    const avatar = (await upload.json()) as { url: string };
    const letters = Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
    const onboarded = await api.post("/api/onboarding", {
      data: { username: `desk.${letters}`, name: "E2E Editor Desk", bio: "The end-to-end suite's Editor Desk.", image: avatar.url, acceptTerms: true },
    });
    if (!onboarded.ok()) return;
    const me = (await (await api.get("/api/me")).json()) as { viewer: { role?: string } | null };
    if (me.viewer?.role === "admin") process.env.E2E_DESK_STATE = JSON.stringify(await api.storageState());
  } catch {
    // No desk → tests that need a reporter fail with a clear message (fixtures.ts `ensureReporter`).
  } finally {
    await api.dispose();
  }
}
