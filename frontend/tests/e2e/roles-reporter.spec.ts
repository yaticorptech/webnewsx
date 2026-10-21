import {
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { ArticleCard, Page as ApiPage, SaveArticleResponse, UploadedImage, ViewerUser } from "../../lib/shared/contracts";
import {
  expect,
  gotoHydrated,
  loginAs,
  publishStory,
  randomLetters,
  samplePng,
  test,
  trackConsoleErrors,
  uniqueMobile,
  waitForStream,
  type TestUser,
} from "./fixtures";

/*
 * Roles for readers and reporters (SPEC §3.2, §3.11): a Reader never sees a publish control, gets their
 * Press Pass from the profile (3 steps → Trainee), sees "+ New story", submits a story to the Review
 * Desk ("In review", not public) and the Editor Desk approves it → public + realtime. Non-destructive:
 * only this run's fixture users and their stories are touched (removed by global teardown).
 */

test.describe.configure({ timeout: 120_000 });

// Compile the routes these tests visit before they start (`next dev` compiles on first hit).
test.beforeAll(async ({ baseURL }) => {
  for (const path of ["/press-pass", "/publish", "/publish/00000000-0000-4000-8000-000000000000", "/t.warmup"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual", signal: AbortSignal.timeout(90_000) }).catch(() => undefined);
  }
});

/** The run's Editor Desk fixture (global-setup.ts signs it up; its session is in E2E_DESK_STATE). */
async function deskApi(baseURL: string): Promise<APIRequestContext> {
  const state = process.env.E2E_DESK_STATE;
  if (!state) throw new Error("No Editor Desk fixture: run the suite through playwright.config.ts");
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
    storageState: JSON.parse(state) as Awaited<ReturnType<APIRequestContext["storageState"]>>,
  });
}

async function newProjectContext(browser: Browser, testInfo: TestInfo, baseURL: string | undefined): Promise<BrowserContext> {
  const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = testInfo.project.use;
  return browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL });
}

/**
 * Files a story with a cover, headline and body through the API as `user` (a reporter): a private
 * draft, or `publish` (which, for a Trainee, goes to the Review Desk).
 */
async function fileStory(user: TestUser, title: string, action: "draft" | "publish" = "draft"): Promise<string> {
  const upload = await user.api.post("/api/upload", {
    multipart: { kind: "cover", file: { name: "cover.png", mimeType: "image/png", buffer: samplePng() } },
  });
  expect(upload.ok()).toBe(true);
  const cover = (await upload.json()) as UploadedImage;
  const res = await user.api.post("/api/articles", {
    data: {
      title,
      bodyHtml: "<p>Residents walked every street of the ward on Saturday night and mapped each broken streetlight.</p>",
      cover: { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl },
      category: "karnataka",
      district: "Mysuru",
      template: "classic",
      action,
    },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as SaveArticleResponse;
  expect(body.status).toBe(action === "draft" ? "draft" : "in_review");
  return body.article.id;
}

/** Issues a Press Pass through the API (the UI flow is covered by its own test). */
async function applyPressPassApi(user: TestUser): Promise<void> {
  const res = await user.api.post("/api/press-pass", {
    data: {
      mobile: uniqueMobile(),
      reporterType: "citizen",
      experience: "new",
      state: "KA",
      district: "Mysuru",
      city: "Mysuru",
      languages: ["en"],
      about: "Filing civic stories from the end-to-end suite.",
      links: [],
      pledgeSignature: user.name,
      acceptPledge: true,
    },
  });
  expect(res.status()).toBe(201);
}

async function latestIds(api: APIRequestContext): Promise<string[]> {
  const res = await api.get("/api/feed?tab=latest");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as ApiPage<ArticleCard>).items.map((item) => item.id);
}

const publishControl = (page: Page) => page.getByRole("link", { name: "Publish a new story" });

test("a Reader sees no publish control anywhere and finds “Get your Press Pass” on their profile", async ({
  page,
  context,
  isMobile,
  createTestUser,
}) => {
  const reader = await createTestUser();
  expect(reader.viewer.role).toBe("reader");
  await loginAs(context, reader);
  const errors = trackConsoleErrors(page);

  await gotoHydrated(page, "/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(publishControl(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^New story$/ })).toHaveCount(0);

  if (isMobile) {
    // Phone bottom bar: Home · + · Profile (owner 2026-09-28); a Reader's "+" leads to the Press Pass first.
    const bar = page.getByRole("navigation", { name: "Primary" });
    await expect(bar.getByRole("link")).toHaveCount(3);
    await expect(bar.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Get your Press Pass" })).toHaveAttribute("href", "/press-pass");
    await expect(bar.getByRole("link", { name: "Profile" })).toHaveAttribute("href", `/${reader.username}`);
    await expect(bar.getByRole("button")).toHaveCount(0);
  } else {
    // The avatar menu offers the Press Pass instead of any publishing link.
    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Get your Press Pass" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Saved" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Newsroom|Editor Desk|Desk/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }

  // Own profile: the Press Pass card sits at the front; no "+ New story".
  await gotoHydrated(page, `/${reader.username}`);
  const main = page.getByRole("main");
  const promo = main.getByTestId("press-pass-promo");
  await expect(promo).toBeVisible();
  await expect(promo.getByRole("heading", { name: "Get your Press Pass" })).toBeVisible();
  await expect(promo.getByRole("link", { name: "Get your Press Pass" })).toHaveAttribute("href", "/press-pass");
  await expect(main.getByRole("link", { name: /^New story$/ })).toHaveCount(0);
  await expect(publishControl(page)).toHaveCount(0);
  await expect(main.getByRole("tab", { name: /Saved/ })).toBeVisible();
  await expect(main.getByRole("tab", { name: /Desk/ })).toHaveCount(0);

  // The composer sends Readers to the Press Pass.
  await page.goto("/publish");
  await page.waitForURL((url) => url.pathname === "/press-pass", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Get your Press Pass" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("Reader → Press Pass (3 steps) → Trainee → “Submit for review” → Editor Desk approves → public + realtime", async ({
  page,
  context,
  browser,
  baseURL,
  isMobile,
  createTestUser,
}, testInfo) => {
  test.setTimeout(180_000);
  const user = await createTestUser();
  await loginAs(context, user);
  const errors = trackConsoleErrors(page);

  // ── 01 Your details: personal details, verification & region, about your reporting — one screen (2026-10-09) ──
  await gotoHydrated(page, "/press-pass");
  await expect(page.getByRole("heading", { level: 1, name: "Get your Press Pass" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your details" })).toBeVisible();
  // Next with nothing filled in: the first problem is pointed out, still on this screen.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Your details" })).toBeVisible();
  await page.getByLabel("Date of birth").fill("1990-05-12");
  await page.getByLabel("Home address").fill("12, 4th Cross, Vijayanagar");
  await page.getByLabel("PIN code").fill("570017");
  await page.getByLabel("Government ID").selectOption("pan");
  await page.getByLabel("ID number").fill("ABCDE1234F");
  await page.getByTestId("reporter-types").getByText("Staff reporter", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Staff reporter" })).toBeChecked();
  await page.getByLabel("News outlet").fill("E2E Evening Post");
  const mobile = uniqueMobile();
  await page.getByLabel("Mobile number").fill(`${mobile.slice(0, 5)} ${mobile.slice(5)}`);
  await page.getByLabel("Reporting experience").selectOption("3_5");
  await page.getByLabel("District").selectOption("Mysuru");
  await page.getByLabel("City or town").fill("Mysuru");
  await page.getByRole("button", { name: "Choose languages" }).click();
  for (const language of ["Kannada", "English"]) await page.getByRole("checkbox", { name: language, exact: true }).check({ force: true });
  await page.keyboard.press("Escape");
  await page.getByLabel("Why I report").fill("I cover ward budgets and civic works across Mysuru for my neighbours.");
  await page.getByRole("button", { name: "Next" }).click();

  // ── 02 Reporter Pledge ──
  await expect(page.getByRole("heading", { level: 2, name: "The Reporter Pledge" })).toBeVisible();
  await page.getByLabel("Sign with your display name").fill(user.name);
  await expect(page.getByText("Matches")).toBeVisible();
  await page.getByText("I take the WebNEWS Reporter Pledge").click();
  await page.getByRole("button", { name: "Issue my Press Pass" }).click();

  // Issued instantly as a Trainee.
  await expect(page.getByRole("heading", { level: 1, name: "Your Press Pass is issued" })).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId("press-pass-card");
  await expect(card).toContainText(user.name);
  await expect(card).toContainText("Mysuru, Karnataka");
  // Verification details stay private to the Editor Desk.
  await expect(card).not.toContainText(mobile.slice(5));
  await expect(card).not.toContainText("E2E Evening Post");
  await expect(page.getByTestId("press-pass-number")).toHaveText(/^WN-KA-\d{6}$/);
  const me = ((await (await user.api.get("/api/me")).json()) as { viewer: ViewerUser }).viewer;
  expect(me.role).toBe("reporter");
  expect(me.reporterLevel).toBe("trainee");

  // The profile now leads with "+ New story" (and the press chips); the masthead "+" appears ≥768px.
  await gotoHydrated(page, `/${user.username}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /^New story$/ })).toHaveAttribute("href", "/publish");
  await expect(main.getByTestId("press-pass-promo")).toHaveCount(0);
  await expect(main.getByTestId("press-chips")).toContainText("Trainee");
  await expect(main.getByTestId("profile-details")).toContainText("Mysuru, Karnataka");
  await expect(main).not.toContainText("E2E Evening Post");
  if (!isMobile) await expect(publishControl(page)).toBeVisible();
  else await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "New story" })).toHaveAttribute("href", "/publish");

  // A Trainee's "publish" goes to the Review Desk.
  const title = `Ward streetlights mapped ${randomLetters(8)}`;
  const storyId = await fileStory(user, title);
  await gotoHydrated(page, `/publish/${storyId}`);
  // Scoped to <main>: while a production page streams in, React briefly keeps the next chunk in a hidden
  // container outside it, so a page-wide lookup can see the banner twice.
  await expect(page.getByRole("main").getByTestId("review-banner")).toHaveAttribute("data-state", "trainee");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Ready to submit.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await expect(page.getByRole("status", { name: "Your story was sent to the Review Desk" })).toBeVisible({ timeout: 30_000 });

  // → the profile's Desk tab, stamped "In review".
  await page.waitForURL((url) => url.pathname === `/${user.username}` && url.searchParams.get("tab") === "drafts", {
    timeout: 30_000,
  });
  const tile = page.getByRole("main").getByTestId("draft-tile").filter({ hasText: title });
  await expect(tile).toHaveAttribute("data-state", "in_review");
  await expect(tile).toContainText("In review");

  // Not public: absent from the Latest feed and the public profile grid.
  const anon = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
  try {
    expect(await latestIds(anon)).not.toContain(storyId);
    const grid = (await (await anon.get(`/api/users/${user.username}/articles`)).json()) as ApiPage<ArticleCard>;
    expect(grid.items.map((item) => item.id)).not.toContain(storyId);

    // A logged-out reader watches Latest while the Editor Desk approves → the story arrives live.
    const other = await newProjectContext(browser, testInfo, baseURL);
    const desk = await deskApi(baseURL!);
    try {
      const watcher = await other.newPage();
      const stream = waitForStream(watcher);
      await gotoHydrated(watcher, "/?tab=latest");
      await stream;
      const approved = await desk.post(`/api/admin/review/${storyId}/approve`, { data: {} });
      expect(approved.ok()).toBe(true);
      await expect(watcher.getByRole("article", { name: title })).toBeVisible({ timeout: 20_000 });
      expect(await latestIds(anon)).toContain(storyId);
    } finally {
      await desk.dispose();
      await other.close();
    }
  } finally {
    await anon.dispose();
  }

  expect(errors).toEqual([]);
});

test("a returned story shows the editor's note in the composer and can be resubmitted", async ({
  page,
  context,
  baseURL,
  createTestUser,
}) => {
  const user = await createTestUser();
  await applyPressPassApi(user);
  const title = `Returned story ${randomLetters(8)}`;
  const storyId = await fileStory(user, title, "publish");
  const note = `Please add the councillor's response ${randomLetters(5)}`;
  const desk = await deskApi(baseURL!);
  try {
    expect((await desk.post(`/api/admin/review/${storyId}/return`, { data: { note } })).ok()).toBe(true);
  } finally {
    await desk.dispose();
  }

  await loginAs(context, user);
  const errors = trackConsoleErrors(page);
  await gotoHydrated(page, `/${user.username}?tab=drafts`);
  const tile = page.getByRole("main").getByTestId("draft-tile").filter({ hasText: title });
  await expect(tile).toHaveAttribute("data-state", "returned");
  await expect(tile).toContainText(note);

  await tile.click();
  await page.waitForURL((url) => url.pathname === `/publish/${storyId}`);
  const banner = page.getByRole("main").getByTestId("review-banner");
  await expect(banner).toHaveAttribute("data-state", "returned");
  await expect(banner).toContainText(note);
  await expect(page.getByRole("heading", { level: 1, name: "Returned story" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("Saved tab: a Reader's saved stories are listed on their own profile and can be removed", async ({
  page,
  context,
  createTestUser,
}) => {
  const publisher = await createTestUser();
  const story = await publishStory(publisher, `Saved for later ${randomLetters(8)}`);
  const reader = await createTestUser();
  expect((await reader.api.post(`/api/articles/${story.id}/save`)).ok()).toBe(true);

  await loginAs(context, reader);
  const errors = trackConsoleErrors(page);
  await gotoHydrated(page, `/${reader.username}`);
  const main = page.getByRole("main");
  // A Reader without stories lands on Saved.
  await expect(main.getByRole("tab", { name: /Saved/ })).toHaveAttribute("aria-selected", "true");
  const tile = main.getByTestId("saved-tile").filter({ hasText: story.title });
  await expect(tile).toBeVisible();
  await expect(tile.getByRole("link")).toHaveAttribute("href", `/a/${story.slug}`);

  const removed = page.waitForResponse(
    (res) => res.url().endsWith(`/api/articles/${story.id}/save`) && res.request().method() === "DELETE",
  );
  await tile.getByRole("button", { name: /Remove .* from Saved/ }).click();
  expect((await removed).ok()).toBe(true);
  await expect(main.getByTestId("saved-tile").filter({ hasText: story.title })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();

  // Someone else's profile never shows their Saved list.
  await gotoHydrated(page, `/${publisher.username}`);
  await expect(page.getByRole("main").getByRole("tab", { name: /Saved/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});
