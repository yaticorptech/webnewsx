import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { TERMS_VERSION } from "../../lib/shared/contracts";
import {
  expect,
  gotoHydrated,
  loginAs,
  navProfileLink,
  randomLetters,
  samplePng,
  test,
  TEST_PASSWORD,
  trackConsoleErrors,
  uniqueEmail,
  uniqueUsername,
} from "./fixtures";

/*
 * Auth, onboarding, profile settings and legal pages (SPEC §3.9). Runs in both projects
 * (desktop 1440 / mobile 390). Non-destructive: every account is a fixture user
 * (`pw.<runTag>.*@test.webnews.local`) removed by global teardown.
 */

/** Same flag the app reads at build time (process env wins over frontend/.env.local). */
function googleEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_GOOGLE_ENABLED !== undefined) return process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";
  try {
    return /^NEXT_PUBLIC_GOOGLE_ENABLED=1\s*$/m.test(readFileSync(join(__dirname, "../../.env.local"), "utf8"));
  } catch {
    return false;
  }
}

// Several dev servers share this machine during development; give each flow room to breathe.
test.describe.configure({ timeout: 90_000 });

const noHorizontalOverflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
const avatarFile = () => ({ name: "portrait.png", mimeType: "image/png", buffer: samplePng() });

// Compile the routes this file visits before the tests start (`next dev` compiles on demand).
test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(120_000);
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) return;
  for (const path of ["/login", "/signup", "/terms", "/privacy", "/settings/profile", "/onboarding"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual", signal: AbortSignal.timeout(90_000) }).catch(() => {});
  }
});

/** Required fields' labels end with a decorative "*", so find them by accessible name. */
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

/** Picks a file for the avatar picker, confirms the crop and waits for the upload to finish. */
async function uploadAvatar(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(avatarFile());
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use photo" }).click();
  // The crop is rendered in the browser (canvas → blob) before the dialog closes; give a busy machine time.
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Change photo" })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText(/Uploading photo/)).toHaveCount(0);
}

test("sign up → onboarding wizard → home with avatar → log out → log in", async ({ page, createTestUser }) => {
  test.setTimeout(120_000);
  const taken = await createTestUser();
  const email = uniqueEmail();
  const errors = trackConsoleErrors(page);

  // Sign up through the UI.
  await gotoHydrated(page, "/signup");
  await expect(page.getByRole("heading", { level: 1, name: "Your byline starts here" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/onboarding");

  // Step 1 — username rules, live availability and suggestions.
  const username = field(page, "Username");
  await expect(page.getByRole("heading", { name: "Claim your byline" })).toBeVisible();
  const base = uniqueUsername();
  await username.fill(`${base}42`);
  await expect(username).toHaveValue(base);
  await expect(page.getByText("Only letters and dots allowed")).toBeVisible();

  await username.fill(taken.username!);
  await expect(page.getByText("Username is not available")).toBeVisible();
  const suggestions = page.getByRole("group", { name: "Available usernames" }).getByRole("button");
  await expect(suggestions.first()).toBeVisible();
  const suggestion = ((await suggestions.first().textContent()) ?? "").replace(/^@/, "").trim();
  expect(suggestion).toMatch(/^[a-z.]+$/);
  await suggestions.first().click();
  await expect(username).toHaveValue(suggestion);
  await expect(page.getByText("Username is available")).toBeVisible();

  const name = `Reporter ${randomLetters(5)}`;
  await field(page, "Display name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — photo is required; crop + upload; bio.
  await expect(page.getByRole("heading", { name: "Put a face to the byline" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please add a profile photo")).toBeVisible();
  await expect(page.getByText("Bio is required")).toBeVisible();
  await uploadAvatar(page);
  await field(page, "Bio").fill("Covering the city desk.\nFiled from the e2e suite.");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — Terms are required. New accounts are Readers, so the last step never promises publishing.
  await expect(page.getByRole("heading", { name: "Check your press pass" })).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText("You must agree to the Terms & Conditions")).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Finish setup" }).click();

  // Home with the new avatar in the nav + welcome toast.
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByText(new RegExp(`Welcome to WebNEWS, ${name}`))).toBeVisible();
  const avatarLink = navProfileLink(page, suggestion);
  await expect(avatarLink).toBeVisible();
  await expect(avatarLink).toHaveAttribute("href", `/${suggestion}`);
  await expect(avatarLink.locator("img")).toHaveAttribute("src", /\/media\/avatars\//);

  // Log out from settings.
  await gotoHydrated(page, "/settings/profile");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  // Masthead on tablets/desktops, the bottom bar on phones.
  await expect(page.getByRole("link", { name: "Log in", exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Log back in through the UI.
  await gotoHydrated(page, "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(navProfileLink(page, suggestion)).toHaveAttribute("href", `/${suggestion}`);
});

test("log in: validation, wrong password, ?next= and redirects for signed-in users", async ({ page, createTestUser }) => {
  const user = await createTestUser();
  const errors = trackConsoleErrors(page);

  await gotoHydrated(page, "/login?next=%2Fsettings%2Fprofile");
  const submit = page.getByRole("button", { name: "Log in", exact: true });
  await submit.click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-it");
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
  expect(errors.filter((e) => !/401|Unauthorized/i.test(e))).toEqual([]);

  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await submit.click();
  await page.waitForURL((url) => url.pathname === "/settings/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Edit profile" })).toBeVisible();

  // Signed-in, onboarded users never see the auth pages or onboarding again.
  await page.goto("/login");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.goto("/signup?next=%2Fterms");
  await expect(page).toHaveURL((url) => url.pathname === "/terms");
  await page.goto("/onboarding");
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("?next= never leaves the site (tab / newline / backslash tricks)", async ({ page, createTestUser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const user = await createTestUser();
  // "/\t/evil.example" is "//evil.example" to a browser (it drops the tab) — a protocol-relative URL.
  const tricks = ["%2F%09%2Fevil.example%2Fphish", "%2F%0A%2Fevil.example", "%2F%5Cevil.example", "%2F%2Fevil.example"];

  await gotoHydrated(page, `/login?next=${tricks[0]}`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(new URL(page.url()).origin).toBe(origin);

  // Signed in: the server-side redirect away from /login and /signup ignores unsafe targets too.
  for (const next of tricks) {
    for (const route of ["/login", "/signup"]) {
      const res = await page.goto(`${route}?next=${next}`);
      expect(res?.status(), `${route}?next=${next}`).toBeLessThan(500);
      expect(new URL(page.url()).origin).toBe(origin);
      expect(new URL(page.url()).pathname).toBe("/");
    }
  }
});

test("sign up: password rules, strength meter and an existing email", async ({ page, createTestUser }) => {
  const existing = await createTestUser();
  await gotoHydrated(page, "/signup");

  const password = page.getByLabel("Password", { exact: true });
  await password.fill("abc");
  await expect(page.getByText("Too short")).toBeVisible();
  await password.fill("Correct horse battery 7!");
  await expect(page.getByText("Strength: Strong")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(existing.email);
  await password.fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

  await password.fill(TEST_PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(`${TEST_PASSWORD}x`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();

  await page.getByLabel("Confirm password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in instead" })).toHaveAttribute("href", "/login");
  await expect(page).toHaveURL(/\/signup$/);
});

test("settings: username, name, bio and photo edits persist", async ({ page, context, createTestUser }) => {
  const user = await createTestUser();
  await loginAs(context, user);
  const errors = trackConsoleErrors(page);
  await gotoHydrated(page, "/settings/profile");

  const username = field(page, "Username");
  await expect(username).toHaveValue(user.username!);
  await expect(page.getByText("This is your current username")).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  const newUsername = uniqueUsername();
  const newName = `Edited ${randomLetters(6)}`;
  const newBio = `Line one ${randomLetters(4)}\nLine two`;
  await username.fill(newUsername);
  await expect(page.getByText("Username is available")).toBeVisible();
  await field(page, "Display name").fill(newName);
  await field(page, "Bio").fill(newBio);
  await uploadAvatar(page);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await save.click();
  await expect(page.getByText("Profile updated")).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible();

  await page.reload();
  await expect(field(page, "Username")).toHaveValue(newUsername);
  await expect(field(page, "Display name")).toHaveValue(newName);
  await expect(field(page, "Bio")).toHaveValue(newBio);
  const avatarLink = navProfileLink(page, newUsername);
  await expect(avatarLink).toBeVisible();
  await expect(avatarLink).toHaveAttribute("href", `/${newUsername}`);
  const src = await avatarLink.locator("img").getAttribute("src");
  expect(src).toMatch(/\/media\/avatars\//);
  expect(src).not.toBe(user.viewer.image);

  // The API agrees.
  const me = (await (await user.api.get("/api/me")).json()) as { viewer: { username: string; name: string; bio: string } };
  expect(me.viewer).toMatchObject({ username: newUsername, name: newName, bio: newBio });
  expect(errors).toEqual([]);
});

test("gates: logged-out visitors go to log in; unfinished profiles can still read the legal pages", async ({ page, context, createTestUser }) => {
  // Inside the (main) shell the page renders under a Suspense boundary (loading.tsx), so this redirect
  // is streamed and completes client-side — give it time on a busy dev server.
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile$/, { timeout: 25_000 });
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);

  const fresh = await createTestUser({ onboarded: false });
  await loginAs(context, fresh);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/onboarding$/);

  for (const [path, title] of [
    ["/terms", "Terms & Conditions"],
    ["/privacy", "Privacy Policy"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(TERMS_VERSION, { exact: true })).toBeVisible();
    await expect(page.getByText("24 September 2026", { exact: true })).toBeVisible();
    await expect(page.getByText("Webnews Network Private Limited").first()).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: /Grievance Officer/ })).toBeVisible();
});

test("Continue with Google heads to accounts.google.com with our callback", async ({ page, baseURL }) => {
  for (const [path, label] of [
    ["/login", "Continue with Google"],
    ["/signup", "Sign up with Google"],
  ] as const) {
    await gotoHydrated(page, path);
    const google = page.getByRole("button", { name: label });
    if (!googleEnabled()) {
      await expect(google).toHaveCount(0);
      continue;
    }
    // Never complete the OAuth dance: stop at Google and inspect the authorization request.
    let authorizeUrl: URL | null = null;
    await page.route("https://accounts.google.com/**", (route) => {
      authorizeUrl = new URL(route.request().url());
      return route.abort();
    });
    await google.click();
    await expect.poll(() => authorizeUrl?.pathname ?? null).toBe("/o/oauth2/v2/auth");
    const url = authorizeUrl as URL | null;
    expect(url?.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/google`);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("auth, onboarding, settings and legal pages fit a 320px screen", async ({ page, context, createTestUser, isMobile }) => {
  test.skip(!isMobile, "narrow-screen layout check runs in the mobile project");
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ["/login", "/signup", "/terms", "/privacy"]) {
    await gotoHydrated(page, path);
    expect(await page.evaluate(noHorizontalOverflow), path).toBeLessThanOrEqual(0);
  }

  const fresh = await createTestUser({ onboarded: false });
  await loginAs(context, fresh);
  await gotoHydrated(page, "/onboarding");
  expect(await page.evaluate(noHorizontalOverflow), "/onboarding").toBeLessThanOrEqual(0);

  await context.clearCookies();
  const user = await createTestUser();
  await loginAs(context, user);
  await gotoHydrated(page, "/settings/profile");
  expect(await page.evaluate(noHorizontalOverflow), "/settings/profile").toBeLessThanOrEqual(0);
});

test("sign-up refuses a weak password until the meter says Good", async ({ page }) => {
  await gotoHydrated(page, "/signup");
  await page.getByLabel("Email", { exact: true }).fill(uniqueEmail());
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("abcdefgh");
  await expect(page.getByText("Strength: Weak")).toBeVisible();
  await page.getByLabel("Confirm password", { exact: true }).fill("abcdefgh");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Choose a stronger password/)).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);

  await password.fill("Harbour-lights7");
  await expect(page.getByText(/Strength: (Good|Strong)/)).toBeVisible();
});
