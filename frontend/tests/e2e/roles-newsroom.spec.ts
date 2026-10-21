import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import type { AdminFlagGroup, AdminSpotlightOrder, ArticleCard, Page as ApiPage } from "../../lib/shared/contracts";
import { expect, gotoHydrated, loginAs, publishStory, randomLetters, test, trackConsoleErrors } from "./fixtures";

/*
 * Roles — Newsroom + reader actions (SPEC §3.11), non-destructive:
 *  - a Reporter fixture sees their analytics, requests a Spotlight (payments not connected → pending),
 *    the suite's Editor Desk fixture grants it through the API, and the story is labelled "Spotlight"
 *    and boosted in For You; the story is deleted at the end so the boost stops at once;
 *  - a Reader fixture saves a story and reports it (the desk sees the report);
 *  - Readers never get the Newsroom.
 * Only this run's fixture users and their stories are touched (global teardown removes them).
 */

test.describe.configure({ timeout: 150_000 });

// `next dev` compiles routes on first visit; warm the ones this spec reaches so compiles don't land mid-test.
test.beforeAll(async ({ baseURL }) => {
  for (const path of ["/newsroom", "/press-pass", "/a/warm-up-route", "/?tab=latest"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual", signal: AbortSignal.timeout(90_000) }).catch(() => undefined);
  }
});

let desk: Promise<APIRequestContext> | null = null;
/** The run's Editor Desk fixture (signed up by global-setup.ts, listed in the e2e backend's ADMIN_EMAILS). */
function deskClient(baseURL: string): Promise<APIRequestContext> {
  desk ??= (async () => {
    const state = process.env.E2E_DESK_STATE;
    if (!state) throw new Error("No Editor Desk fixture — run the suite through playwright.config.ts");
    return playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL }, storageState: JSON.parse(state) });
  })();
  return desk;
}

/** Walks a paged admin list until `match` finds an item (other suites may have rows too). */
async function findPaged<T>(api: APIRequestContext, path: string, match: (item: T) => boolean): Promise<T | undefined> {
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await api.get(`${path}${sep}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
    const page = (await res.json()) as ApiPage<T>;
    const found = page.items.find(match);
    if (found || !page.nextCursor) return found;
    cursor = page.nextCursor;
  }
  return undefined;
}

test("reporter sees Newsroom analytics, requests a Spotlight; the Editor Desk grants it and the story is labelled + boosted", async ({
  page,
  context,
  baseURL,
  createTestUser,
}) => {
  const reporter = await createTestUser({ role: "reporter" });
  const story = await publishStory(reporter, `Newsroom spotlight ${randomLetters(8)}`);
  const errors = trackConsoleErrors(page);
  await loginAs(context, reporter);

  try {
    await gotoHydrated(page, "/newsroom");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(reporter.name);

    // KPI tiles, both charts (keyboard-reachable), best times, the story row.
    for (const kpi of ["views", "reads", "likes", "shares", "followers", "stories"]) {
      await expect(page.locator(`[data-kpi="${kpi}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-kpi="stories"]')).toContainText("1");
    await expect(page.getByRole("heading", { name: "Views & engagement" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Views per day, last 7 days/ })).toBeAttached();
    await expect(page.getByRole("heading", { name: "Follower growth" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Best time to publish" })).toBeVisible();

    // The range filter scopes the numbers.
    const thirty = page.getByRole("button", { name: "30 days" });
    await thirty.click();
    await expect(thirty).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: /Views per day, last 30 days/ })).toBeAttached();

    // The chart's table twin lists every day.
    await page.locator('section[aria-labelledby="newsroom-audience"]').getByText("Show data table").click();
    await expect(page.getByRole("table", { name: /per day, last 30 days/ })).toBeVisible();

    const row = page.locator(`[data-newsroom-story="${story.id}"]:visible`);
    await expect(row).toContainText(story.title);
    await expect(row.locator('[data-story-status="published"]')).toBeVisible();

    // Spotlight: pick the 1-day package → "Continue to payment" → request goes to the Editor Desk.
    await row.locator("[data-spotlight-button]").click();
    const sheet = page.getByRole("dialog", { name: "Spotlight this story" });
    await expect(sheet.locator('[data-spotlight-sheet="choose"]')).toBeVisible();
    await expect(sheet).toContainText("₹");
    await sheet.locator('[data-spotlight-package="24"]').click();
    await sheet.getByRole("button", { name: /Continue to payment/ }).click();
    const sent = page.getByRole("dialog", { name: "Request sent" });
    await expect(sent).toContainText("Payments launch soon — your Spotlight request was sent to the Editor Desk.", { timeout: 30_000 });
    await expect(sent.locator('[data-spotlight-state="pending"]')).toBeVisible();
    await sent.getByRole("button", { name: "Done" }).click();
    await expect(sent).toBeHidden();
    await expect(row.locator('[data-spotlight-state="pending"]')).toBeVisible();

    // The Editor Desk grants it (payments are manual for now).
    const api = await deskClient(baseURL!);
    const order = await findPaged<AdminSpotlightOrder>(api, "/api/admin/spotlight/orders?status=pending", (o) => o.article.id === story.id);
    expect(order, "pending order visible to the Editor Desk").toBeTruthy();
    expect(order!.priceInr).toBeGreaterThan(0);
    const grant = await api.post(`/api/admin/spotlight/orders/${order!.id}/grant`, { data: {} });
    expect(grant.ok()).toBeTruthy();

    // Labelled on the article page and on its feed card (transparency).
    await expect(async () => {
      await gotoHydrated(page, `/a/${story.slug}`);
      await expect(page.locator('[data-story-label="spotlight"]').first()).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 60_000 });
    const card = page.locator(`[data-story-id="${story.id}"]`).first();
    await expect(async () => {
      // A loaded dev backend can time out the SSR feed fetch (empty page) — reload until the card is there.
      await gotoHydrated(page, "/?tab=latest");
      await expect(card.locator('[data-story-label="spotlight"]')).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 60_000 });

    // Boosted: For You (as an anonymous reader) carries it with the Spotlight badge. Only one Spotlight fits in
    // each 10-story block, and while the whole suite runs dozens of brand-new fixture stories pull the
    // cold-start floor down, so look through the first 10 blocks (the ranking math has its own API tests).
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      let boosted: ArticleCard | undefined;
      let cursor: string | null = null;
      for (let block = 0; block < 10 && !boosted; block++) {
        const res = await anon.get(`/api/feed?tab=foryou${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        const forYou = (await res.json()) as ApiPage<ArticleCard>;
        boosted = forYou.items.find((item) => item.id === story.id);
        cursor = forYou.nextCursor;
        if (!cursor) break;
      }
      expect(boosted, "spotlighted story in the first For You blocks").toBeTruthy();
      expect(boosted!.badges?.spotlight).toBe(true);
    } finally {
      await anon.dispose();
    }

    // The Newsroom now shows the boost as live.
    await expect(async () => {
      await gotoHydrated(page, "/newsroom");
      await expect(page.locator(`[data-spotlight-order="${order!.id}"] [data-spotlight-state="active"]`)).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 60_000 });

    expect(errors).toEqual([]);
  } finally {
    // Stop the boost right away (the fixture user and everything else goes in global teardown).
    await reporter.api.delete(`/api/articles/${story.id}`);
  }
});

test("reader saves a story and reports it to the Editor Desk", async ({ page, context, baseURL, createTestUser }) => {
  const author = await createTestUser();
  const story = await publishStory(author, `Report me ${randomLetters(8)}`);
  const reader = await createTestUser();
  const errors = trackConsoleErrors(page);
  await loginAs(context, reader);
  await gotoHydrated(page, `/a/${story.slug}`);

  // Save for later: bookmark toggles, the toast points to the Saved tab, the API has it.
  const save = page.getByRole("button", { name: "Save story" });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Saved for later", { exact: true })).toBeVisible();
  await expect
    .poll(async () => ((await (await reader.api.get("/api/me/saved")).json()) as ApiPage<ArticleCard>).items.map((i) => i.id))
    .toContain(story.id);

  // Readers never see Spotlight / Newsroom actions in the story menu.
  await page.getByRole("button", { name: "More story actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Spotlight this story" })).toHaveCount(0);

  // Report: reason + note → confirmation.
  await page.getByRole("menuitem", { name: "Report story" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this story" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog).toContainText("Choose what's wrong with this story");
  await dialog.getByText("Spam or scam").click();
  await dialog.getByRole("textbox").fill("E2E: looks like a fake giveaway.");
  await dialog.getByRole("button", { name: "Send report" }).click();
  const done = page.getByRole("dialog", { name: "Report received" });
  await expect(done).toContainText("the Editor Desk has your report");
  await done.getByRole("button", { name: "Done" }).click();
  await expect(done).toBeHidden();

  // The menu remembers it.
  await page.getByRole("button", { name: "More story actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Reported to the Editor Desk" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  // The Editor Desk has the report in its queue.
  const api = await deskClient(baseURL!);
  const group = await findPaged<AdminFlagGroup>(api, "/api/admin/flags?status=open", (g) => g.article.id === story.id);
  expect(group, "report in the Editor Desk's flags queue").toBeTruthy();
  expect(group!.reasons.spam).toBe(1);
  expect(group!.flags[0]?.note).toBe("E2E: looks like a fake giveaway.");

  // Saved state survives a reload (server-rendered viewer.saved).
  await gotoHydrated(page, `/a/${story.slug}`);
  await expect(page.getByRole("button", { name: "Save story" })).toHaveAttribute("aria-pressed", "true");

  // …and on the feed card too.
  const card = page.locator(`[data-story-id="${story.id}"]`).first();
  await expect(async () => {
    await gotoHydrated(page, "/?tab=latest");
    await expect(card.getByRole("button", { name: "Save story" })).toHaveAttribute("aria-pressed", "true", { timeout: 8_000 });
  }).toPass({ timeout: 60_000 });

  expect(errors).toEqual([]);
});

test("readers don't get the Newsroom, and logged-out readers are asked to log in to report", async ({ page, context, createTestUser }) => {
  const author = await createTestUser();
  const story = await publishStory(author);

  await gotoHydrated(page, `/a/${story.slug}`);
  await page.getByRole("main").getByRole("button", { name: "Report story" }).first().click();
  await expect(page.getByRole("dialog", { name: "Log in to report a story" })).toBeVisible();

  const reader = await createTestUser();
  await loginAs(context, reader);
  await page.goto("/newsroom");
  await expect(page).toHaveURL(/\/press-pass$/, { timeout: 60_000 });
});
