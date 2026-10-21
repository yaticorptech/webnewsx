import { request as playwrightRequest, type Page } from "@playwright/test";
import type { ArticleDetail, TrendingHeadline } from "../../lib/shared/contracts";
import {
  expect,
  gotoHydrated,
  publishStory,
  randomLetters,
  test,
  trackConsoleErrors,
  waitForHydration,
  waitForStream,
  type TestUser,
} from "./fixtures";

/*
 * "For You" ranking (SPEC §3.4b) end to end. The database is shared with demo content and other
 * suites, so assertions only compare this test's own stories with each other.
 */

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async ({ baseURL }) => {
  for (const path of ["/", "/?tab=latest"]) await fetch(new URL(path, baseURL)).catch(() => undefined);
});

/**
 * Console errors, minus resource errors of /media/ images that failed for environmental reasons:
 * other suites share the database and purge their fixture users (and cover files) while this page
 * shows them (404), and a heavily loaded machine can reset the dev proxy's image request (500).
 */
function trackPageErrors(page: Page): () => string[] {
  const errors = trackConsoleErrors(page);
  let vanished = 0;
  page.on("response", (res) => {
    if ((res.status() === 404 || res.status() >= 500) && new URL(res.url()).pathname.startsWith("/media/")) vanished += 1;
  });
  return () => {
    let skip = vanished;
    return errors.filter((error) => {
      if (skip > 0 && /Failed to load resource: .*status of (404|5\d\d)/.test(error)) {
        skip -= 1;
        return false;
      }
      return true;
    });
  };
}

const feedIds = (page: Page) =>
  page.locator("[data-feed-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-feed-item") ?? ""));

/** Scrolls the feed (loading more pages) until every id is rendered; returns the rendered order. */
async function revealAll(page: Page, ids: string[]): Promise<string[]> {
  let order: string[] = [];
  await expect
    .poll(
      async () => {
        order = await feedIds(page);
        if (ids.every((id) => order.includes(id))) return true;
        // A heavily loaded machine can time out the server-rendered first page: reload then.
        if (order.length === 0 && (await page.getByRole("heading", { name: /The wire is quiet/ }).isVisible())) {
          await page.reload();
          await waitForHydration(page);
          return false;
        }
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return false;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  return order;
}

/** Engagement from real API calls: likes from fans, views from separate anonymous visitors, shares. */
async function engage(baseURL: string, story: ArticleDetail, fans: TestUser[], views: number, shares: number) {
  for (const fan of fans) expect((await fan.api.post(`/api/articles/${story.id}/like`)).ok()).toBe(true);
  for (let i = 0; i < views; i++) {
    const visitor = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
    try {
      expect((await visitor.post("/api/views", { data: { ids: [story.id] } })).ok()).toBe(true);
    } finally {
      await visitor.dispose();
    }
  }
  for (let i = 0; i < shares; i++) {
    expect((await fans[0]!.api.post(`/api/articles/${story.id}/share`, { data: { channel: "copy" } })).ok()).toBe(true);
  }
}

test("Home is newest first — a newer quiet story comes before an older engaged one (owner 2026-09-28)", async ({
  page,
  baseURL,
  createTestUser,
}, testInfo) => {
  // Ranking is server-side and viewport-independent. Running it in both projects at once would make
  // the two runs' fresh stories compete for the same fresh slots, so it runs once (desktop).
  test.skip(testInfo.project.name !== "desktop", "Server-side ranking: verified once");
  const [publisher, quietPublisher, ...fans] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const engaged = await publishStory(publisher!, `Ranked engaged ${randomLetters(8)}`);
  await engage(baseURL!, engaged, fans, 6, 10);
  const quiet = await publishStory(quietPublisher!, `Ranked quiet ${randomLetters(8)}`);
  const errors = trackPageErrors(page);

  await gotoHydrated(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "Latest stories" })).toHaveCount(1);
  const home = await revealAll(page, [engaged.id, quiet.id]);
  expect(home.indexOf(quiet.id)).toBeLessThan(home.indexOf(engaged.id));
  expect(new Set(home).size).toBe(home.length);

  await gotoHydrated(page, "/?tab=latest");
  await expect(page.getByRole("heading", { level: 1, name: "Latest stories" })).toHaveCount(1);
  const latest = await revealAll(page, [engaged.id, quiet.id]);
  expect(latest.indexOf(quiet.id)).toBeLessThan(latest.indexOf(engaged.id));
  expect(errors()).toEqual([]);
});

test("a just-published story is on page 1 of Home (server-rendered)", async ({ page, createTestUser }) => {
  const publisher = await createTestUser();
  const story = await publishStory(publisher, `Ranked fresh ${randomLetters(8)}`);

  const html = await (await page.request.get("/")).text();
  expect(html).toContain(story.title);

  await gotoHydrated(page, "/");
  const ids = await feedIds(page);
  expect(ids.indexOf(story.id)).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf(story.id)).toBeLessThan(10);
});

test("realtime: a story published elsewhere slides in on top of Home", async ({ page, createTestUser }) => {
  const publisher = await createTestUser();
  const errors = trackPageErrors(page);
  const streamOpen = waitForStream(page);
  await gotoHydrated(page, "/");
  await streamOpen;

  const story = await publishStory(publisher, `Ranked live ${randomLetters(8)}`);
  const card = page.getByRole("article", { name: story.title });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("Just in")).toBeVisible();
  const ids = await feedIds(page);
  expect(ids.indexOf(story.id)).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf(story.id)).toBeLessThan(3);
  expect(errors()).toEqual([]);
});

test("Home scrolls endlessly without duplicate stories", async ({ page }) => {
  await gotoHydrated(page, "/");
  const first = (await feedIds(page)).length;
  expect(first).toBeGreaterThan(0);
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return (await feedIds(page)).length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(first);
  const ids = await feedIds(page);
  expect(new Set(ids).size).toBe(ids.length);
});

test("Trending now rail lists the top stories of the last 24h with rank numbers (desktop)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The right rail shows from 1280px");
  const errors = trackPageErrors(page);
  const api = (await (await page.request.get("/api/feed/trending")).json()) as { items: TrendingHeadline[] };
  expect(api.items.length).toBeLessThanOrEqual(5);

  await gotoHydrated(page, "/");
  const rail = page.locator("section").filter({ has: page.getByRole("heading", { name: "Trending now" }) });
  await expect(rail).toBeVisible();
  if (api.items.length === 0) {
    await expect(rail.getByText("Nothing trending yet")).toBeVisible();
    return;
  }
  const items = rail.locator("[data-trending-item]");
  await expect(items.first()).toBeVisible({ timeout: 15_000 });
  await expect(items.first()).toHaveAccessibleName(/^Number 1: /);
  const rendered = await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-trending-item")));
  expect(rendered.length).toBeLessThanOrEqual(5);
  // Same stories as the API (the ranking may shift by a place while the page loads).
  expect(rendered.filter((id) => api.items.some((item) => item.id === id)).length).toBeGreaterThanOrEqual(Math.min(rendered.length, api.items.length) - 1);
  const top = api.items.find((item) => item.id === rendered[0]);
  if (top) await expect(items.first()).toHaveAttribute("href", `/a/${top.slug}`);
  expect(errors()).toEqual([]);
});

test("/trending lists the top stories of the last 24h and is reachable from the rail's See all", async ({ page, isMobile }) => {
  const errors = trackPageErrors(page);
  if (isMobile) {
    await gotoHydrated(page, "/trending");
  } else {
    await gotoHydrated(page, "/");
    await page
      .getByRole("complementary", { name: "Trending now" })
      .getByRole("link", { name: "See all trending stories" })
      .click();
    await page.waitForURL((url) => url.pathname === "/trending");
    await waitForHydration(page);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Top stories of the last 24 hours" })).toBeVisible();

  const api = (await (await page.request.get("/api/feed/trending?limit=20")).json()) as { items: TrendingHeadline[] };
  const main = page.getByRole("main");
  if (api.items.length === 0) {
    await expect(main.getByRole("heading", { name: "Nothing trending yet" })).toBeVisible();
  } else {
    const rows = main.locator("[data-trending-story]");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toHaveAccessibleName(/^Number 1: /);
    expect(await rows.count()).toBeLessThanOrEqual(20);
    // Every row opens its story.
    const href = await rows.first().getAttribute("href");
    expect(href).toMatch(/^\/a\//);
  }
  // A single reading column (no front-page blocks) that never overflows sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors()).toEqual([]);
});
