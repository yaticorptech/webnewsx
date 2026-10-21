import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, request as playwrightRequest, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import type { ArticleDetail, Category, SaveArticleResponse, UploadedImage, ViewerUser } from "../../lib/shared/contracts";

/*
 * Shared e2e fixtures. The suite runs against the ONE database (webnews_platform) next to demo
 * content and real accounts, so it is non-destructive:
 *  - every user is created through the API with `pw.<runTag>.<random letters>@test.webnews.local`
 *    and a random letters-and-dots username (`t.<letters>`);
 *  - tests assert only on data they created (or on "at least one" of something);
 *  - global-teardown.ts deletes exactly this run's users (FK cascade removes their articles, likes,
 *    follows, sessions and uploads).
 * Roles (SPEC §3.11): every new account is a Reader. Publishing needs a Reporter, so the suite has
 * its own Editor Desk fixture (global-setup.ts signs up `E2E_DESK_EMAIL`, which playwright.config.ts
 * puts in the e2e backend's ADMIN_EMAILS) that promotes fixture users to Verified Reporters.
 * Import `test`/`expect` from this file instead of "@playwright/test".
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export const TEST_PASSWORD = "Tidal-Clock-e2e-7";

export function randomLetters(length = 8): string {
  return Array.from({ length }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

/** Run tag set by playwright.config.ts (shared by the runner and every worker). */
export function runTag(): string {
  const tag = process.env.E2E_RUN_TAG;
  if (!tag || !/^[a-z]+$/.test(tag)) throw new Error("E2E_RUN_TAG missing — run the suite through playwright.config.ts");
  return tag;
}

/** Unique fixture email that global teardown will remove. Use it for UI sign-ups too. */
export function uniqueEmail(): string {
  return `pw.${runTag()}.${randomLetters(10)}@test.webnews.local`;
}

/** Unique valid username: letters and dots only (never digits), e.g. "t.qxkzvbmaaw". */
export function uniqueUsername(): string {
  return `t.${randomLetters(10)}`;
}

/** Random 10-digit Indian mobile number for Press Pass applications (one pass per number). */
export function uniqueMobile(): string {
  return `6${Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("")}`;
}

/** A small real PNG (the app icon) — the backend re-encodes uploads, so any decodable image works. */
const SAMPLE_PNG = join(__dirname, "../../public/icons/icon-512.png");
export function samplePng(): Buffer {
  return readFileSync(SAMPLE_PNG);
}

type StorageCookie = Awaited<ReturnType<APIRequestContext["storageState"]>>["cookies"][number];

export type TestUser = {
  id: string;
  /** Frontend origin the user's API client talks to. */
  baseURL: string;
  email: string;
  password: string;
  /** null until onboarded. */
  username: string | null;
  name: string;
  onboarded: boolean;
  viewer: ViewerUser;
  /** Better Auth session cookie(s) for the frontend origin — pass to `loginAs`. */
  cookies: StorageCookie[];
  /** API client carrying this user's session (same-origin through the Next.js rewrite). */
  api: APIRequestContext;
};

export type CreateTestUserOptions = {
  /** Finish onboarding (username, name, bio, avatar, terms). Default true. */
  onboarded?: boolean;
  /**
   * "reader" (default, like every new account) or "reporter" = Verified Reporter who publishes
   * instantly. `publishStory` promotes readers on demand, so only UI-publishing tests need this.
   */
  role?: "reader" | "reporter";
  username?: string;
  name?: string;
};

async function expectOk(res: Awaited<ReturnType<APIRequestContext["get"]>>, label: string): Promise<void> {
  if (!res.ok()) throw new Error(`${label} failed: HTTP ${res.status()} ${await res.text()}`);
}

/**
 * Creates a user through the FRONTEND origin (`/api/auth/sign-up/email` via the rewrite), so the
 * session cookie is first-party on the app's origin exactly like a real browser sign-up.
 */
export async function createTestUser(baseURL: string, options: CreateTestUserOptions = {}): Promise<TestUser> {
  const { onboarded = true } = options;
  const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const email = uniqueEmail();

  let signUp = await api.post("/api/auth/sign-up/email", { data: { email, password: TEST_PASSWORD, name: "" } });
  // Better Auth rate-limits sign-ups per IP; every fixture comes from localhost, so back off and retry.
  for (let attempt = 0; signUp.status() === 429 && attempt < 4; attempt++) {
    const retryAfter = Number(signUp.headers()["x-retry-after"] ?? signUp.headers()["retry-after"]);
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 3) * 1000));
    signUp = await api.post("/api/auth/sign-up/email", { data: { email, password: TEST_PASSWORD, name: "" } });
  }
  await expectOk(signUp, "sign-up");

  let viewer = ((await (await api.get("/api/me")).json()) as { viewer: ViewerUser }).viewer;

  if (onboarded) {
    const upload = await api.post("/api/upload", {
      multipart: { kind: "avatar", file: { name: "avatar.png", mimeType: "image/png", buffer: samplePng() } },
    });
    await expectOk(upload, "avatar upload");
    const avatar = (await upload.json()) as UploadedImage;
    const res = await api.post("/api/onboarding", {
      data: {
        username: options.username ?? uniqueUsername(),
        name: options.name ?? `E2E ${randomLetters(5)}`,
        bio: "Filing from the end-to-end suite.",
        image: avatar.url,
        acceptTerms: true,
      },
    });
    await expectOk(res, "onboarding");
    viewer = ((await res.json()) as { user: ViewerUser }).user;
  }

  const { cookies } = await api.storageState();
  const user: TestUser = {
    id: viewer.id,
    baseURL,
    email,
    password: TEST_PASSWORD,
    username: viewer.username,
    name: viewer.name,
    onboarded: viewer.onboarded,
    viewer,
    cookies,
    api,
  };
  if (options.role === "reporter") await ensureReporter(user);
  return user;
}

/** API client of the suite's Editor Desk fixture (see the header comment). */
let deskClient: Promise<APIRequestContext> | null = null;
function desk(baseURL: string): Promise<APIRequestContext> {
  deskClient ??= (async () => {
    const state = process.env.E2E_DESK_STATE;
    if (!state) {
      throw new Error(
        "No Editor Desk fixture: run the suite through playwright.config.ts (its backend lists E2E_DESK_EMAIL in ADMIN_EMAILS)",
      );
    }
    return playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL },
      storageState: JSON.parse(state) as Awaited<ReturnType<APIRequestContext["storageState"]>>,
    });
  })();
  return deskClient;
}

/**
 * Makes `user` a Verified Reporter (Press Pass issued by the Editor Desk fixture, then verified) so
 * their stories publish instantly. No-op for reporters and admins. Updates `user.viewer`.
 */
export async function ensureReporter(user: TestUser): Promise<void> {
  if (user.viewer.role !== "reader") return;
  if (!user.onboarded) throw new Error("only onboarded users can become reporters");
  const api = await desk(user.baseURL);
  await expectOk(await api.post(`/api/admin/users/${user.id}/role`, { data: { role: "reporter" } }), "make reporter");
  await expectOk(await api.post(`/api/admin/reporters/${user.id}/verify`, { data: {} }), "verify reporter");
  user.viewer = ((await (await user.api.get("/api/me")).json()) as { viewer: ViewerUser }).viewer;
  if (user.viewer.role !== "reporter" || user.viewer.reporterLevel !== "verified") {
    throw new Error(`expected a verified reporter, got ${user.viewer.role}/${user.viewer.reporterLevel}`);
  }
}

/** Signs the browser context in as `user` (adds the session cookie; no UI round-trip). */
export async function loginAs(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addCookies(user.cookies);
}

/** Publishes a story as `user` through the API (cover upload + POST /api/articles); readers are promoted first. */
export async function publishStory(
  user: TestUser,
  title = `E2E story ${randomLetters(8)}`,
  category: Category = "national",
  district: string | null = null,
): Promise<ArticleDetail> {
  await ensureReporter(user);
  const upload = await user.api.post("/api/upload", {
    multipart: { kind: "cover", file: { name: "cover.png", mimeType: "image/png", buffer: samplePng() } },
  });
  await expectOk(upload, "cover upload");
  const cover = (await upload.json()) as UploadedImage;
  const res = await user.api.post("/api/articles", {
    data: {
      title,
      bodyHtml: "<p>Filed by the end-to-end suite to check that the live wire updates without a reload.</p>",
      cover: { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl },
      category,
      district,
      action: "publish",
    },
  });
  await expectOk(res, "publish");
  const body = (await res.json()) as SaveArticleResponse;
  if (body.status !== "published") throw new Error("expected a published article");
  return body.article;
}

/** Framework noise that is not an app error (kept deliberately narrow). */
function isIgnorableConsoleError(text: string, url: string | undefined): boolean {
  // Production builds prefetch links to routes that don't exist yet (RSC `?_rsc=` 404s).
  if (text.startsWith("Failed to load resource") && url?.includes("_rsc=")) return true;
  // Parallel tests delete their own stories (and teardown their users) while other pages still show them:
  // the removed cover/avatar under /media/ then 404s. That is correct behaviour, not an app error.
  if (text.includes("status of 404") && url?.includes("/media/")) return true;
  // `next dev` only: when Turbopack compiles another route mid-test, Next's own OuterLayoutRouter can log a
  // React key warning. It never names our components and never happens in production builds.
  if (text.includes('unique "key" prop') && text.includes("Check the render method of `OuterLayoutRouter`")) return true;
  return false;
}

/**
 * Collects console errors, page errors and hydration warnings (minus the framework noise above).
 */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const type = message.type();
    if (type === "error" && isIgnorableConsoleError(text, message.location().url)) return;
    if (type === "error" || (type === "warning" && /hydrat|did not match/i.test(text))) errors.push(`${type}: ${text}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * `page.goto(url)` + wait until React has hydrated the app shell (`<html data-hydrated>`, set by
 * AppProviders). Click only after this — earlier clicks hit server HTML without handlers (React may
 * replay them later, which makes toggles flip twice).
 */
export async function gotoHydrated(page: Page, url: string) {
  const response = await page.goto(url);
  await waitForHydration(page);
  return response;
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** Resolves once the page's shared EventSource (/api/stream) has received its response headers. */
export function waitForStream(page: Page) {
  return page.waitForResponse((res) => new URL(res.url()).pathname.endsWith("/api/stream") && res.status() === 200);
}

type Fixtures = {
  /** `createTestUser({ onboarded })` bound to the suite's baseURL; users are removed by global teardown. */
  createTestUser: (options?: CreateTestUserOptions) => Promise<TestUser>;
};

export const test = base.extend<Fixtures>({
  // (Playwright's `use` callback is named `provide` so the React hooks lint rule leaves it alone.)
  createTestUser: async ({ baseURL }, provide) => {
    const created: TestUser[] = [];
    await provide(async (options) => {
      const user = await createTestUser(baseURL!, options);
      created.push(user);
      return user;
    });
    // Rows are deleted by global teardown; here we only release the HTTP clients.
    await Promise.all(created.map((user) => user.api.dispose()));
  },
});

export { expect };

/**
 * The signed-in viewer's profile link in the navigation: the masthead avatar (≥768px) or, on phones, the bottom bar's
 * Profile tab (the masthead has no avatar there — owner rule 2026-09-25). Exactly one of them is visible.
 */
export function navProfileLink(page: Page, username: string) {
  return page
    .getByRole("banner")
    .getByRole("link", { name: `Your profile, @${username}` })
    .or(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Profile" }))
    .filter({ visible: true });
}
