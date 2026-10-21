import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite (system Chrome, `channel: "chrome"` — no browser download).
 *
 * Starts its OWN backend + frontend on dedicated ports so it never collides with `npm run dev`
 * (:3000/:4000) or other agents:
 *   E2E_BACKEND_PORT  (default 4199)  → backend  PORT, FRONTEND_URL = http://localhost:<E2E_FRONTEND_PORT>
 *   E2E_FRONTEND_PORT (default 3199)  → a production build (`next build && next start`) with
 *                                       BACKEND_URL = http://localhost:<E2E_BACKEND_PORT> and NEXT_DIST_DIR=.next-e2e-<port>
 *   E2E_DEV=1                         → `next dev` instead (compiles routes on demand: slower and noisier under
 *                                       parallel load — use it to debug, not for the gate)
 *   E2E_BASE_URL=http://localhost:3102 → test an app that is already running; start nothing
 *   E2E_WORKERS       (default 3)     → parallel workers
 *
 * DATABASE: there is only webnews_platform, so the suite is NON-DESTRUCTIVE. Fixture users get
 * `pw.<runTag>.<random letters>@test.webnews.local` emails (tests/e2e/fixtures.ts) and global teardown deletes
 * exactly this run's users (`npm --prefix ../backend run db:clean-test -- --prefix=pw.<runTag>.`).
 *
 * ROLES: the e2e backend's ADMIN_EMAILS is this run's Editor Desk fixture (`E2E_DESK_EMAIL`, also a
 * pw.<runTag>. address), which global-setup.ts signs up and verifies (`npm run admin:verify`) so fixtures
 * can promote Reporters.
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const randomLetters = (length: number) =>
  Array.from({ length }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");

// The config is evaluated by the runner AND by every worker; workers inherit the runner's env,
// so the first evaluation fixes the tag for the whole run.
process.env.E2E_RUN_TAG ||= randomLetters(8);
const deskEmail = (process.env.E2E_DESK_EMAIL ||= `pw.${process.env.E2E_RUN_TAG}.desk.${randomLetters(8)}@test.webnews.local`);

const backendPort = Number(process.env.E2E_BACKEND_PORT || 4199);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 3199);
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, "");
const frontendUrl = externalBaseUrl || `http://localhost:${frontendPort}`;
const backendUrl = `http://localhost:${backendPort}`;
// Production build by default: `next dev` compiles each route on first hit and pushes HMR updates to every open
// page, which made parallel runs time out on a busy machine. (E2E_PROD=1 is still accepted — it is the default.)
const prod = process.env.E2E_DEV !== "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One `next dev` server renders for every worker; Playwright's default (half the CPU cores) swamps it with
  // on-demand compiles and SSR, and tests then time out. E2E_WORKERS overrides.
  workers: Number(process.env.E2E_WORKERS) || (process.env.CI ? 2 : 3),
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: frontendUrl,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /security\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", testIgnore: /security\.spec\.ts/, use: { ...devices["Pixel 7"], channel: "chrome", viewport: { width: 390, height: 844 } } },
    // Abuse checks exhaust the servers' per-IP rate limits, so they run once everything else has finished.
    {
      name: "security",
      testMatch: /security\.spec\.ts/,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          name: "backend",
          cwd: "../backend",
          command: "npm run db:migrate --silent && node --import tsx src/index.ts",
          url: `${backendUrl}/api/health`,
          env: { PORT: String(backendPort), FRONTEND_URL: frontendUrl, LOG_REQUESTS: "0", ADMIN_EMAILS: deskEmail },
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: "ignore",
          stderr: "pipe",
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
        {
          name: "frontend",
          // Loopback only: a test server is never reachable from the LAN. The long keep-alive stops the fixtures'
          // API clients (which reuse idle sockets) from racing Next's 5 s default close → sporadic ECONNRESET.
          command: prod
            ? `npx next build && npx next start -p ${frontendPort} -H 127.0.0.1 --keepAliveTimeout 70000`
            : `npx next dev -p ${frontendPort} -H 127.0.0.1`,
          url: frontendUrl,
          env: {
            NEXT_DIST_DIR: `.next-e2e-${frontendPort}`,
            BACKEND_URL: backendUrl,
            NEXT_PUBLIC_SITE_URL: frontendUrl,
          },
          reuseExistingServer: false,
          timeout: prod ? 300_000 : 120_000,
          stdout: "ignore",
          stderr: "pipe",
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
      ],
});
