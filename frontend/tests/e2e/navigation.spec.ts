import { expect, gotoHydrated, loginAs, publishStory, test, trackConsoleErrors } from "./fixtures";

/*
 * The label-less back arrow (owner rule 2026-09-25): every page but the home feed (and the Editor Desk Overview)
 * opens with a round ← ("Go back"). It returns to the previous page of the site, or to the feed when the page was
 * opened directly — it never leaves the site.
 */

const back = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Go back" });

test("home has no back arrow; a story opened from the feed goes back to the feed", async ({ page, createTestUser }) => {
  const errors = trackConsoleErrors(page);
  const story = await publishStory(await createTestUser(), `Back arrow check ${Date.now().toString(36)}`);
  await gotoHydrated(page, "/?tab=latest");
  await expect(back(page)).toHaveCount(0);

  // The reel's headline link is for keyboards (taps open the "Read full article" popup).
  const link = page.locator("main article[data-story-id]").filter({ hasText: story.title }).getByRole("link", { name: story.title }).first();
  await link.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === `/a/${story.slug}`);
  await expect(back(page)).toBeVisible();
  await back(page).click();
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("tab") === "latest");
  expect(errors).toEqual([]);
});

test("a page opened directly goes back to the feed, never out of the site", async ({ page }) => {
  await gotoHydrated(page, "/about");
  await back(page).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("the back arrow is on the auth, legal and not-found pages too", async ({ page }) => {
  for (const path of ["/login", "/signup", "/terms", "/privacy", "/trending", "/this/does-not-exist"]) {
    await gotoHydrated(page, path);
    await expect(back(page), path).toBeVisible();
  }
});

test("after logging in from a story opened directly, the arrow stays on the site", async ({ page, createTestUser }) => {
  const story = await publishStory(await createTestUser(), `Login round trip ${Date.now().toString(36)}`);
  const reader = await createTestUser();
  await gotoHydrated(page, `/a/${story.slug}`);
  // Save → "Log in to save stories for later" → Log in → back on the story (the login page is replaced).
  await page.getByRole("main").getByRole("button", { name: "Save story" }).first().click();
  await page.getByRole("dialog", { name: "Log in to save stories for later" }).getByRole("link", { name: "Log in" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("Email", { exact: true }).fill(reader.email);
  await page.getByLabel("Password", { exact: true }).fill(reader.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/a/${story.slug}`);
  // The only earlier entries are this same story: the arrow goes to the feed, never back out of the site.
  await back(page).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("on the composer the arrow asks before leaving unsaved work", async ({ page, context, createTestUser }) => {
  const reporter = await createTestUser({ role: "reporter" });
  await loginAs(context, reporter);
  await gotoHydrated(page, "/publish");
  await page.getByRole("textbox", { name: "Headline" }).fill("Unsaved headline");
  await back(page).click();
  const leave = page.getByRole("dialog", { name: "Leave this story?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: /Keep writing|Stay/ }).first().click();
  await expect(page).toHaveURL(/\/publish$/);
});
