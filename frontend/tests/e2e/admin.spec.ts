import { request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import type { SaveArticleResponse, SpotlightPackage, UploadedImage } from "../../lib/shared/contracts";
import {
  createTestUser,
  expect,
  gotoHydrated,
  loginAs,
  publishStory,
  randomLetters,
  samplePng,
  test,
  trackConsoleErrors,
  uniqueMobile,
  waitForHydration,
  type TestUser,
} from "./fixtures";

/*
 * Editor Desk console (SPEC §3.11). Non-destructive like the rest of the suite: every story, report,
 * Spotlight request and account these tests act on is a fixture they created (`pw.<runTag>.…`
 * users, removed by global teardown), and every list is searched by the fixture's unique title or
 * username — demo content and real accounts are never touched.
 */

/** The run's Editor Desk fixture (global-setup.ts), used only to promote fixture users. */
async function desk(baseURL: string): Promise<APIRequestContext> {
  const state = process.env.E2E_DESK_STATE;
  if (!state) throw new Error("No Editor Desk fixture — run the suite through playwright.config.ts");
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
    storageState: JSON.parse(state) as Awaited<ReturnType<APIRequestContext["storageState"]>>,
  });
}

/**
 * An onboarded fixture user promoted to the Editor Desk (the console needs a finished profile). Promotion signs them
 * out everywhere, so they log in again with email + password (the only way into the Desk) for `loginAs`.
 */
async function createAdmin(baseURL: string): Promise<TestUser> {
  const user = await createTestUser(baseURL);
  const api = await desk(baseURL);
  try {
    const res = await api.post(`/api/admin/users/${user.id}/role`, { data: { role: "admin" } });
    expect(res.ok(), await res.text()).toBe(true);
  } finally {
    await api.dispose();
  }
  const signIn = await user.api.post("/api/auth/sign-in/email", { data: { email: user.email, password: user.password } });
  expect(signIn.ok(), await signIn.text()).toBe(true);
  return { ...user, cookies: (await user.api.storageState()).cookies };
}

/** A Trainee reporter (Press Pass applied through the API) whose "publish" goes to the Review Desk. */
async function submitTraineeStory(user: TestUser, title: string): Promise<string> {
  const pass = await user.api.post("/api/press-pass", {
    data: {
      mobile: uniqueMobile(),
      reporterType: "citizen",
      experience: "new",
      state: "KA",
      district: "Mysuru",
      city: "Mysuru",
      languages: ["en"],
      about: "I cover my ward for the end-to-end suite.",
      links: [],
      pledgeSignature: user.name,
      acceptPledge: true,
    },
  });
  expect(pass.status(), await pass.text()).toBe(201);
  const upload = await user.api.post("/api/upload", {
    multipart: { kind: "cover", file: { name: "cover.png", mimeType: "image/png", buffer: samplePng() } },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const cover = (await upload.json()) as UploadedImage;
  const res = await user.api.post("/api/articles", {
    data: {
      title,
      bodyHtml: "<p>Filed by a Trainee in the end-to-end suite so the Review Desk has something to approve.</p>",
      cover: { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl },
      category: "education",
      action: "publish",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const body = (await res.json()) as SaveArticleResponse;
  expect(body.status).toBe("in_review");
  return body.article.id;
}

/** The dialog that is currently open. */
function dialog(page: Page) {
  return page.getByRole("dialog");
}

test.describe("Editor Desk", () => {
  test("is a 404 for signed-out visitors and readers", async ({ page, context, createTestUser: newUser }) => {
    const signedOut = await page.goto("/admin");
    expect(signedOut?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /isn.t on the wire/i })).toBeVisible();

    const reader = await newUser();
    await loginAs(context, reader);
    const asReader = await page.goto("/admin/review");
    expect(asReader?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /isn.t on the wire/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Editor Desk sections" })).toHaveCount(0);
  });

  test("opens only from the Log in page: the admin's email + password go straight to the Desk", async ({ page, baseURL }) => {
    const admin = await createAdmin(baseURL!);
    // Typing the address doesn't open it (owner rule 2026-09-25): "Page not found" until the admin logs in.
    expect((await page.goto("/admin"))?.status()).toBe(404);

    const errors = trackConsoleErrors(page);
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email", { exact: true }).fill(admin.email);
    await page.getByLabel("Password", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Editor Desk sections" })).toBeVisible();

    // The Overview has no back arrow; "Visit site" opens the public site in a new tab.
    await expect(page.getByRole("button", { name: "Go back" })).toHaveCount(0);
    const visit = page.getByRole("link", { name: /Visit site/ }).first();
    await expect(visit).toHaveAttribute("href", "/");
    await expect(visit).toHaveAttribute("target", "_blank");

    // On the site an admin is a visitor: no account menu, no Log in — an "Admin panel" button instead, and account
    // actions explain the visitor view.
    await gotoHydrated(page, "/");
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toHaveCount(0);
    // Masthead on tablets/desktops, the bottom bar on phones.
    const adminPanel = page.getByRole("link", { name: "Admin panel" }).filter({ visible: true }).first();
    await expect(adminPanel).toBeVisible();
    const like = page.locator("main article[data-story-id]").first().getByRole("button", { name: /^Like/ });
    if ((await like.count()) > 0) {
      await like.click();
      await expect(page.getByRole("dialog", { name: "You're viewing the site as a visitor" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await adminPanel.click();
    await page.waitForURL((url) => url.pathname === "/admin");

    // Every console page but the Overview opens with the back arrow: the previous page, else the Overview.
    await page.getByRole("navigation", { name: "Editor Desk sections" }).getByRole("link", { name: /People/ }).click();
    await page.waitForURL((url) => url.pathname === "/admin/people");
    await page.getByRole("button", { name: "Go back" }).click();
    await page.waitForURL((url) => url.pathname === "/admin");
    await gotoHydrated(page, "/admin/review");
    await page.getByRole("button", { name: "Go back" }).click();
    await page.waitForURL((url) => url.pathname === "/admin");
    await waitForHydration(page);

    // No way back to the site's account pages from the Desk; Log out returns to the Log in page.
    await expect(page.getByRole("link", { name: /WebNEWS home|Back to WebNEWS|Exit|Your profile/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/login");
    expect(errors).toEqual([]);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  });

  test("a warning reaches the reporter: banner on every page until “Got it”, then kept in the Newsroom", async ({ page, context, baseURL, createTestUser: newUser }) => {
    const [admin, reporter, reader] = await Promise.all([createAdmin(baseURL!), newUser({ role: "reporter" }), newUser()]);
    const story = await publishStory(reporter, `Warned story ${randomLetters(8)}`);
    expect((await reader.api.post(`/api/articles/${story.id}/flag`, { data: { reason: "misinformation" } })).ok()).toBe(true);
    const note = "Check your sources before publishing.";
    const warn = await admin.api.post(`/api/admin/flags/${story.id}/resolve`, { data: { action: "warn", note } });
    expect(warn.ok(), await warn.text()).toBe(true);

    await loginAs(context, reporter);
    await gotoHydrated(page, "/");
    const banner = page.locator('[data-notice="warning"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Warning from the Editor Desk");
    await expect(banner).toContainText(story.title);
    await expect(banner).toContainText(note);
    // Still there on the next page, until acknowledged.
    await gotoHydrated(page, "/trending");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Got it" }).click();
    await expect(banner).toHaveCount(0);
    await gotoHydrated(page, "/");
    await expect(page.locator("[data-notice]")).toHaveCount(0);

    await gotoHydrated(page, "/newsroom");
    const panel = page.getByRole("region", { name: /Notices from the Editor Desk/ });
    await expect(panel).toContainText(story.title);
    await expect(panel).toContainText(note);
  });

  test("approves a Trainee story at the Review Desk", async ({ page, context, baseURL, createTestUser: newUser }) => {
    const errors = trackConsoleErrors(page);
    const title = `Review desk story ${randomLetters(8)}`;
    const [admin, trainee] = await Promise.all([createAdmin(baseURL!), newUser()]);
    const articleId = await submitTraineeStory(trainee, title);

    await loginAs(context, admin);
    await gotoHydrated(page, "/admin/review");
    await expect(page.getByRole("heading", { name: "Review Desk", level: 1 })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("0 of 3 approved")).toBeVisible();

    await card.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByLabel("Note to the reporter").fill("Clear and well sourced — thank you.");
    await dialog(page).getByRole("button", { name: "Approve & publish" }).click();

    await expect(page.getByText("Approved — the story is live")).toBeVisible();
    await expect(card).toHaveCount(0);
    const owned = await trainee.api.get(`/api/articles/${articleId}`);
    expect(((await owned.json()) as { article: { status: string } }).article.status).toBe("published");
    expect(errors).toEqual([]);
  });

  test("hides a reported story from the Flags queue", async ({ page, context, baseURL, createTestUser: newUser }) => {
    const errors = trackConsoleErrors(page);
    const [admin, reporter, reader] = await Promise.all([createAdmin(baseURL!), newUser({ role: "reporter" }), newUser()]);
    const story = await publishStory(reporter, `Flagged story ${randomLetters(8)}`);
    const flag = await reader.api.post(`/api/articles/${story.id}/flag`, { data: { reason: "misinformation", note: "The numbers don't add up." } });
    expect(flag.status(), await flag.text()).toBe(201);

    await loginAs(context, admin);
    await gotoHydrated(page, "/admin/flags");
    const card = page.getByRole("article").filter({ hasText: story.title });
    await expect(card).toBeVisible();
    await expect(card.getByText("“The numbers don't add up.”")).toBeVisible();

    await card.getByRole("button", { name: "Hide story" }).click();
    await dialog(page).getByLabel("Reason").fill("Unverified figures");
    await dialog(page).getByRole("button", { name: "Hide story" }).click();

    await expect(page.getByText("Story hidden", { exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    // Gone from public surfaces: the article page is a 404 for everyone else…
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      expect((await anon.get(`/api/articles/by-slug/${story.slug}`)).status()).toBe(404);
      // …until the desk undoes it from the toast.
      await page.getByRole("region", { name: "Notifications" }).getByRole("button", { name: "Unhide" }).click();
      await expect(page.getByText("Story visible again")).toBeVisible();
      await expect.poll(async () => (await anon.get(`/api/articles/by-slug/${story.slug}`)).status()).toBe(200);
    } finally {
      await anon.dispose();
    }
    expect(errors).toEqual([]);
  });

  test("grants a Spotlight request", async ({ page, context, baseURL, createTestUser: newUser }) => {
    const errors = trackConsoleErrors(page);
    const [admin, reporter] = await Promise.all([createAdmin(baseURL!), newUser({ role: "reporter" })]);
    const story = await publishStory(reporter, `Spotlight story ${randomLetters(8)}`);
    const { items } = (await (await reporter.api.get("/api/spotlight/packages")).json()) as { items: SpotlightPackage[] };
    expect(items.length).toBeGreaterThan(0);
    const order = await reporter.api.post("/api/spotlight/orders", { data: { articleId: story.id, packageId: items[0]!.id } });
    expect(order.status(), await order.text()).toBe(201);

    await loginAs(context, admin);
    await gotoHydrated(page, "/admin/spotlight");
    const row = page.getByRole("row").filter({ hasText: story.title });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Grant" }).click();
    await dialog(page).getByLabel("Note").fill("Comped by the e2e suite");
    await dialog(page).getByRole("button", { name: "Grant Spotlight" }).click();

    await expect(page.getByText("Spotlight granted")).toBeVisible();
    await expect(row).toHaveCount(0);
    await page.getByRole("radio", { name: "Running" }).click();
    const running = page.getByRole("row").filter({ hasText: story.title });
    await expect(running.getByText("Running")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("suspends and unsuspends an account from People", async ({ page, context, baseURL, createTestUser: newUser }) => {
    const errors = trackConsoleErrors(page);
    const [admin, target] = await Promise.all([createAdmin(baseURL!), newUser()]);

    await loginAs(context, admin);
    await gotoHydrated(page, `/admin/people?q=${target.username}`);
    const row = page.getByRole("row").filter({ hasText: target.username! });
    await expect(row).toBeVisible();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: `Actions for @${target.username}` }).click();
    await page.getByRole("menuitem", { name: "Suspend…" }).click();
    // A reason is required.
    await dialog(page).getByRole("button", { name: "Suspend account" }).click();
    await expect(dialog(page).getByText("Give a reason")).toBeVisible();
    await dialog(page).getByLabel(/Reason/).fill("Repeated spam after two warnings");
    await dialog(page).getByRole("button", { name: "Suspend account" }).click();

    await expect(page.getByText("Account suspended")).toBeVisible();
    await expect(row.getByText("Suspended", { exact: true })).toBeVisible();
    await expect(row.getByText("Repeated spam after two warnings")).toBeVisible();
    // Every session was revoked and sign-in is refused.
    const me = (await (await target.api.get("/api/me")).json()) as { viewer: unknown };
    expect(me.viewer).toBeNull();
    const blocked = await target.api.post("/api/auth/sign-in/email", { data: { email: target.email, password: target.password } });
    expect(blocked.status()).toBe(403);

    await row.getByRole("button", { name: `Actions for @${target.username}` }).click();
    await page.getByRole("menuitem", { name: "Lift suspension" }).click();
    await expect(page.getByText("Suspension lifted")).toBeVisible();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
    const again = await target.api.post("/api/auth/sign-in/email", { data: { email: target.email, password: target.password } });
    expect(again.ok(), await again.text()).toBe(true);
    expect(errors).toEqual([]);
  });
});
