import type { Page } from "@playwright/test";
import type { SaveArticleResponse } from "../../lib/shared/contracts";
import {
  expect,
  gotoHydrated,
  loginAs,
  publishStory,
  randomLetters,
  test,
  trackConsoleErrors,
  uniqueUsername,
  waitForStream,
} from "./fixtures";

/*
 * Profile page (SPEC §3.7). Non-destructive: every user and story here is a fixture of this run
 * (removed by global teardown); assertions only look at those fixtures.
 */

/**
 * `trackConsoleErrors` minus dev-only noise: errors React logs while `next dev` Fast Refresh is
 * rebuilding (files edited elsewhere during the run trigger an RSC refetch mid-hydration, e.g.
 * "Can't perform a React state update on a component that hasn't mounted yet"). Never applies to
 * production builds, where Fast Refresh doesn't exist. Returns a getter for the remaining errors.
 */
function trackPageErrors(page: Page): () => string[] {
  const errors = trackConsoleErrors(page);
  const duringRefresh: string[] = [];
  let rebuilding = false;
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("[Fast Refresh] rebuilding")) rebuilding = true;
    else if (text.startsWith("[Fast Refresh] done")) rebuilding = false;
    else if (rebuilding && message.type() === "error") duringRefresh.push(`error: ${text}`);
  });
  return () => errors.filter((error) => !duringRefresh.includes(error));
}

// Compile /[username] before the tests so `next dev` doesn't compile it mid-test (once per worker).
test.beforeAll(async ({ playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) return;
  const request = await playwright.request.newContext({ baseURL });
  await request.get(`/${uniqueUsername()}`, { timeout: 90_000 }).catch(() => undefined);
  await request.dispose();
});

test("own profile shows counts, the grid and the Drafts tab", async ({ page, context, createTestUser }) => {
  const me = await createTestUser();
  const story = await publishStory(me, `Profile grid ${randomLetters(8)}`);
  const draftTitle = `Profile draft ${randomLetters(8)}`;
  const saved = await me.api.post("/api/articles", { data: { title: draftTitle, action: "draft" } });
  expect(saved.ok()).toBe(true);
  const draftId = ((await saved.json()) as SaveArticleResponse).article.id;

  await loginAs(context, me);
  const errors = trackPageErrors(page);
  await gotoHydrated(page, `/${me.username}`);
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { level: 1, name: me.name })).toBeVisible();
  // Handles read "@username" (owner 2026-09-25: the classic "@" is back).
  await expect(main.locator(`[data-handle="${me.username}"]`).first()).toHaveText(`@${me.username}`);
  await expect(main.getByTestId("stat-articles")).toContainText("1");
  await expect(main.getByTestId("stat-followers")).toContainText("0");
  await expect(main.getByTestId("stat-following")).toContainText("0");
  await expect(main.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/settings/profile");
  await expect(main.getByRole("button", { name: /^Follow/ })).toHaveCount(0);

  const tile = main.getByTestId("profile-tile").filter({ hasText: story.title });
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute("href", `/a/${story.slug}`);

  // Drafts tab: owner only, deep-linkable.
  const draftsTab = main.getByRole("tab", { name: /Drafts/ });
  await expect(draftsTab).toHaveAttribute("aria-selected", "false");
  await draftsTab.click();
  await expect(draftsTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=drafts$/);
  const draft = main.getByTestId("draft-tile").filter({ hasText: draftTitle });
  await expect(draft).toBeVisible();
  await expect(draft).toContainText("Draft");
  await expect(draft).toHaveAttribute("href", `/publish/${draftId}`);
  await expect(main.getByTestId("draft-tile").filter({ hasText: story.title })).toHaveCount(0);

  await gotoHydrated(page, `/${me.username}?tab=drafts`);
  await expect(main.getByRole("tab", { name: /Drafts/ })).toHaveAttribute("aria-selected", "true");
  await expect(main.getByTestId("draft-tile").filter({ hasText: draftTitle })).toBeVisible();

  expect(errors()).toEqual([]);
});

test("another user's profile hides Drafts; following updates the count and the followers list", async ({
  page,
  context,
  createTestUser,
}) => {
  const author = await createTestUser();
  await publishStory(author);
  const viewer = await createTestUser();

  await loginAs(context, viewer);
  const errors = trackPageErrors(page);
  await gotoHydrated(page, `/${author.username}`);
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { level: 1, name: author.name })).toBeVisible();
  await expect(main.getByRole("tab", { name: /Articles/ })).toBeVisible();
  await expect(main.getByRole("tab", { name: /Drafts/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Share/ })).toBeVisible();

  const followers = main.getByTestId("stat-followers");
  await expect(followers).toContainText("0");

  const followed = page.waitForResponse(
    (res) => res.url().endsWith(`/api/users/${author.username}/follow`) && res.request().method() === "POST",
  );
  await main.getByRole("button", { name: `Follow @${author.username}` }).click();
  await expect(main.getByRole("button", { name: `Following @${author.username}` })).toBeVisible();
  await expect(followers).toContainText("1");
  expect((await followed).ok()).toBe(true);

  await followers.click();
  const dialog = page.getByRole("dialog", { name: "Followers" });
  await expect(dialog).toBeVisible();
  const row = dialog.getByTestId("follow-row").filter({ hasText: viewer.username! });
  await expect(row).toBeVisible();
  await expect(row).toContainText("You");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The server agrees after a reload.
  await gotoHydrated(page, `/${author.username}`);
  await expect(main.getByTestId("stat-followers")).toContainText("1");
  await expect(main.getByRole("button", { name: `Following @${author.username}` })).toBeVisible();

  expect(errors()).toEqual([]);
});

test("unknown username shows the branded 404", async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoHydrated(page, `/${uniqueUsername()}`);
  await expect(page.getByRole("heading", { level: 1, name: "No one files under that name" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Back to the feed" })).toHaveAttribute("href", "/");
  await expect(page).toHaveTitle(/Profile not found/);
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  expect(errors()).toEqual([]);
});

test("a grid tile opens the article", async ({ page, createTestUser }) => {
  const author = await createTestUser();
  const story = await publishStory(author, `Tile opens ${randomLetters(8)}`);
  await gotoHydrated(page, `/${author.username}`);
  await page.getByRole("main").getByTestId("profile-tile").filter({ hasText: story.title }).click();
  await page.waitForURL(`**/a/${story.slug}`);
});

test("a new story by the owner appears at the top of the grid without a reload", async ({ page, createTestUser }) => {
  const author = await createTestUser();
  await publishStory(author, `Older story ${randomLetters(6)}`);
  const stream = waitForStream(page);
  await gotoHydrated(page, `/${author.username}`);
  await stream;
  const main = page.getByRole("main");
  await expect(main.getByTestId("stat-articles")).toContainText("1");

  const title = `Live on profile ${randomLetters(8)}`;
  await publishStory(author, title);
  await expect(main.getByTestId("profile-tile").first()).toContainText(title);
  await expect(main.getByTestId("profile-tile")).toHaveCount(2);
  await expect(main.getByTestId("stat-articles")).toContainText("2");
});
