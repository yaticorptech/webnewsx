import { expect, gotoHydrated, publishStory, randomLetters, test } from "./fixtures";

/* Masthead search (owner rule 2026-09-25): a small icon opens it; people and stories appear as you type; Enter opens one. */

test("typing lists people and stories at once; Enter opens the highlighted one", async ({ page, createTestUser }) => {
  const tag = randomLetters(7);
  const author = await createTestUser({ username: `seek.${tag}` });
  const story = await publishStory(author, `Tidal clock ${tag} keeps perfect time`);

  await gotoHydrated(page, "/");
  // The masthead has only a small search icon; it opens a small search panel right under it.
  await page.getByRole("banner").getByRole("button", { name: "Search people and stories" }).filter({ visible: true }).click();
  const box = page.getByRole("search").getByRole("combobox", { name: "Search people and stories" });
  await expect(box).toBeFocused();
  await box.fill(`seek.${tag.slice(0, 3)}`);
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByRole("option", { name: new RegExp(`seek\\.${tag}`) })).toBeVisible();

  await box.fill(tag);
  await expect(results.getByRole("option", { name: new RegExp(`Tidal clock ${tag}`) })).toBeVisible();
  await box.press("ArrowDown");
  await box.press("Enter");
  await page.waitForURL((url) => url.pathname === `/seek.${tag}` || url.pathname === `/a/${story.slug}`);
});
