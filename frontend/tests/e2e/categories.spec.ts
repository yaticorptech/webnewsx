import type { ArticleCard, Page as ApiPage } from "../../lib/shared/contracts";
import { expect, gotoHydrated, loginAs, publishStory, randomLetters, test, trackConsoleErrors } from "./fixtures";

/*
 * Category nav + category pages (owner 2026-09-26, SPEC §3.12): icon chips replace For You / Latest;
 * Karnataka ▾ opens the 31 districts, More ▾ the other sections; every story lives in one category and
 * its author can move it. Non-destructive: only this run's fixture users and their stories are touched.
 */

test.describe.configure({ timeout: 120_000 });

// `next dev` compiles routes on first hit; warm the category routes before the tests start.
test.beforeAll(async ({ baseURL }) => {
  for (const path of ["/category/sports", "/category/karnataka/mysuru"]) {
    await fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
  }
});

test("the category nav opens a section, More and a Karnataka district", async ({ page, createTestUser }) => {
  const errors = trackConsoleErrors(page);
  const author = await createTestUser();
  const tag = randomLetters(6);
  const sports = await publishStory(author, `Kabaddi league final ${tag}`, "sports");
  const mysuru = await publishStory(author, `Dasara lights switched on ${tag}`, "karnataka", "Mysuru");
  const crime = await publishStory(author, `Court orders a ward audit ${tag}`, "crime");

  await gotoHydrated(page, "/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Following" })).toHaveAttribute("href", "/?tab=following");
  const cards = page.locator("main article[data-story-id]");

  // A main section: its stories only, newest first, no back arrow (it's a feed).
  await nav.getByRole("link", { name: "Sports" }).click();
  await page.waitForURL((url) => url.pathname === "/category/sports");
  await expect(nav.getByRole("link", { name: "Sports" })).toHaveAttribute("aria-current", "page");
  await expect(cards.filter({ hasText: sports.title })).toHaveCount(1);
  await expect(cards.filter({ hasText: mysuru.title })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go back" })).toHaveCount(0);

  // More ▾: Escape closes it and returns focus; a tile opens that section and the chip shows it.
  const more = nav.getByRole("button", { name: /^More/ });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: "More sections" });
  await expect(panel.getByRole("link")).toHaveCount(9);
  await expect(panel.getByRole("link", { name: "Trending" })).toHaveAttribute("href", "/trending");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await panel.getByRole("link", { name: "Crime & Law" }).click();
  await page.waitForURL((url) => url.pathname === "/category/crime");
  await expect(nav.getByRole("button", { name: /Crime & Law/ })).toBeVisible();
  await expect(cards.filter({ hasText: crime.title })).toHaveCount(1);

  // Karnataka ▾: All Karnataka + 31 districts, with a search box.
  await nav.getByRole("button", { name: /Karnataka/ }).click();
  const districts = page.getByRole("region", { name: "Karnataka districts" });
  await expect(districts.getByRole("link")).toHaveCount(32);
  await districts.getByRole("searchbox", { name: "Find a district" }).fill("mys");
  await expect(districts.getByRole("link")).toHaveCount(2);
  await districts.getByRole("link", { name: "Mysuru" }).click();
  await page.waitForURL((url) => url.pathname === "/category/karnataka/mysuru");
  await expect(nav.getByRole("button", { name: /Karnataka · Mysuru/ })).toBeVisible();
  const card = cards.filter({ hasText: mysuru.title });
  await expect(card).toHaveCount(1);
  // The card's section label links to the same page.
  await expect(card.getByRole("link", { name: "Mysuru, Karnataka" })).toHaveAttribute("href", "/category/karnataka/mysuru");

  await gotoHydrated(page, "/category/karnataka/udupi");
  await expect(cards.filter({ hasText: mysuru.title })).toHaveCount(0);

  // Unknown sections and districts outside Karnataka are "not found" (inside the app shell, like unknown profiles).
  for (const path of ["/category/gossip", "/category/sports/mysuru"]) {
    await gotoHydrated(page, path);
    await expect(page.getByRole("heading", { level: 1, name: "This story isn’t on the wire" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  }
  expect(errors).toEqual([]);
});

test("the author moves a published story to another category from its ⋯ menu", async ({ page, context, createTestUser }) => {
  const errors = trackConsoleErrors(page);
  const author = await createTestUser({ role: "reporter" });
  await loginAs(context, author);
  const story = await publishStory(author, `Filed in the wrong section ${randomLetters(6)}`, "others");

  await gotoHydrated(page, `/a/${story.slug}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Others", exact: true }).first()).toBeVisible();
  await main.getByRole("button", { name: "More story actions" }).first().click();
  await page.getByRole("menuitem", { name: "Change category…" }).click();

  const dialog = page.getByRole("dialog", { name: "Change category" });
  await dialog.getByRole("combobox", { name: "Category" }).selectOption("karnataka");
  await dialog.getByRole("button", { name: "Move story" }).click();
  await expect(dialog.locator("#move-category-error")).toHaveText("Choose the district");
  await dialog.getByRole("combobox", { name: "District" }).selectOption("Udupi");
  await dialog.getByRole("button", { name: "Move story" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Category changed", { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Udupi, Karnataka" }).first()).toBeVisible();

  const feed = (await (await page.request.get("/api/feed?category=karnataka&district=Udupi&limit=30")).json()) as ApiPage<ArticleCard>;
  expect(feed.items.map((item) => item.id)).toContain(story.id);
  expect(errors).toEqual([]);
});
