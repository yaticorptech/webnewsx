import type { APIRequestContext, Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import type { ArticleDetail, SaveArticleResponse, UploadedImage } from "../../lib/shared/contracts";
import {
  ensureReporter,
  expect,
  gotoHydrated,
  loginAs,
  publishStory,
  randomLetters,
  samplePng,
  test,
  trackConsoleErrors,
  waitForHydration,
  waitForStream,
  type TestUser,
} from "./fixtures";

/*
 * Feed + article e2e (SPEC §3.3–3.5, §5.3–5.4). Runs against the ONE shared database next to demo
 * content, the owner's data and other parallel tests, so every assertion targets stories this
 * test published itself (unique titles), never absolute positions or totals.
 */

type PublishOptions = { title?: string; linkUrl?: string; bodyHtml?: string; cover?: UploadedImage };

async function uploadCover(user: TestUser): Promise<UploadedImage> {
  await ensureReporter(user); // only Reporters may upload covers and publish (SPEC §3.11)
  const res = await user.api.post("/api/upload", {
    multipart: { kind: "cover", file: { name: "cover.png", mimeType: "image/png", buffer: samplePng() } },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as UploadedImage;
}

async function publish(user: TestUser, options: PublishOptions = {}): Promise<ArticleDetail> {
  await ensureReporter(user);
  const cover = options.cover ?? (await uploadCover(user));
  const res = await user.api.post("/api/articles", {
    data: {
      title: options.title ?? `Feed story ${randomLetters(10)}`,
      bodyHtml:
        options.bodyHtml ??
        "<p>Filed by the feed suite: the council confirmed the plan and residents will be consulted next week.</p><h2>What next</h2><p>More detail follows.</p>",
      cover: { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl },
      linkUrl: options.linkUrl,
      category: "national",
      action: "publish",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const body = (await res.json()) as SaveArticleResponse;
  if (body.status !== "published") throw new Error("expected a published story");
  return body.article;
}

async function articleData(api: APIRequestContext, slug: string) {
  const res = await api.get(`/api/articles/by-slug/${slug}`);
  return { status: res.status(), article: res.ok() ? ((await res.json()) as { article: ArticleDetail }).article : null };
}

/** A second browser context with the same device settings as the current project. */
async function newProjectContext(browser: Browser, testInfo: TestInfo, baseURL: string | undefined): Promise<BrowserContext> {
  const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = testInfo.project.use;
  return browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL });
}

/**
 * These scenarios follow the chronological Latest tab, where a just-published story is on top. The
 * ranked For You default at "/" (and its realtime inserts) is covered by ranking.spec.ts.
 */
const LATEST = "/?tab=latest";

// Parallel tests (and other suites) publish too, so a story may already sit below the first page.
test.describe.configure({ timeout: 90_000 });

const card = (page: Page, title: string) => page.getByRole("article", { name: title });

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

/** Scrolls the feed (loading more pages) until the story's card exists, then brings it into view. */
async function revealCard(page: Page, title: string) {
  const target = card(page, title);
  await expect
    .poll(
      async () => {
        if ((await target.count()) > 0) return true;
        // A heavily loaded machine can time out the server-rendered first page: reload then.
        if (await page.getByRole("heading", { name: /The wire is quiet/ }).isVisible()) {
          await page.reload();
          await waitForHydration(page);
          return false;
        }
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await target.scrollIntoViewIfNeeded();
  return target;
}
const likeButton = (page: Page, title: string) => card(page, title).getByRole("button", { name: /^Like/ });
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The reel's Follow badge on the author photo ("Follow @user"); it goes once the follow lands. */
const followButton = (page: Page, title: string, username: string) =>
  card(page, title).getByRole("button", { name: new RegExp(`Follow(ing)? @${escapeRe(username)}$`) });

test.beforeAll(async ({ baseURL }) => {
  // Compile the article route and the Following tab up front (next dev compiles on demand).
  for (const path of ["/a/warm-up-route", "/?tab=following", "/?tab=latest"]) {
    await fetch(new URL(path, baseURL)).catch(() => undefined);
  }
});

test("feed renders the first page server-side and infinite scroll loads more", async ({ page, createTestUser }) => {
  const publisher = await createTestUser();
  const cover = await uploadCover(publisher);
  const tag = randomLetters(6);
  const titles: string[] = [];
  for (let i = 0; i < 11; i += 1) {
    const title = `Scroll ${tag} story ${"abcdefghijk"[i]}`;
    titles.push(title);
    await publish(publisher, { title, cover });
  }
  const newest = titles[titles.length - 1]!;
  const oldest = titles[0]!;
  const errors = trackPageErrors(page);

  // Server-rendered: the newest story is in the HTML before any client fetch. (Latest = chronological;
  // the ranked For You default at "/" is covered by ranking.spec.ts.)
  const html = await (await page.request.get("/?tab=latest")).text();
  expect(html).toContain(newest);

  await gotoHydrated(page, "/?tab=latest");
  await expect(card(page, newest)).toBeVisible();
  await expect(card(page, oldest)).toHaveCount(0);
  const firstPage = await page.locator("[data-feed-item]").count();
  expect(firstPage).toBeGreaterThanOrEqual(10);

  // Generous: under a full parallel run the phone emulation's main thread can stall for many seconds.
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        return card(page, oldest).count();
      },
      { timeout: 45_000 },
    )
    .toBe(1);
  expect(await page.locator("[data-feed-item]").count()).toBeGreaterThan(firstPage);
  expect(errors()).toEqual([]);
});

test("back-to-top appears after ~1.5 screens of scrolling and returns to the top", async ({ page, createTestUser, isMobile }) => {
  // Enough stories of our own for a page taller than ~2.5 screens, whatever else is in the database.
  const publisher = await createTestUser();
  const cover = await uploadCover(publisher);
  for (let i = 0; i < 4; i += 1) await publish(publisher, { title: `Scroll home ${randomLetters(8)}`, cover });
  const errors = trackPageErrors(page);

  await gotoHydrated(page, LATEST);
  // The floating button (aria-label); the "You're all caught up" panel has its own text button.
  const toTop = page.locator('button[aria-label="Back to top"]');
  await expect(toTop).toHaveCount(0);
  // Below ~1.5 screens it stays hidden. (Stories that parallel suites publish slide in above and the feed keeps the
  // reader's place by scrolling down by their height, so re-apply the position before each look.)
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.8, behavior: "instant" }));
        await page.waitForTimeout(300);
        return toTop.count();
      },
      { timeout: 10_000 },
    )
    .toBe(0);

  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2, behavior: "instant" }));
  await expect(toTop).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await toTop.boundingBox())!;
  // Bottom-right corner of the viewport…
  expect(box.x + box.width).toBeGreaterThan(viewport.width - 48);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  if (isMobile) {
    // …and above the phone bottom tab bar.
    const bar = (await page.getByRole("navigation", { name: "Primary" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  }

  await expect(toTop).toHaveAccessibleName("Back to top");
  await toTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeLessThan(5);
  await expect(toTop).toHaveCount(0);
  // Keyboard users continue from the top of the content.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
  expect(errors()).toEqual([]);
});

test("like toggles optimistically, persists, and double-tap on the cover likes", async ({ page, context, createTestUser }) => {
  const publisher = await createTestUser();
  const reader = await createTestUser();
  const story = await publish(publisher);
  await loginAs(context, reader);
  const errors = trackPageErrors(page);

  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  const like = likeButton(page, story.title);
  await expect(like).toHaveAttribute("aria-pressed", "false");
  const liked = page.waitForResponse((r) => r.url().endsWith(`/api/articles/${story.id}/like`) && r.request().method() === "POST");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toHaveAccessibleName(/1 like$/);
  expect((await liked).ok()).toBe(true);

  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await revealCard(page, story.title);
  await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "true");
  await likeButton(page, story.title).click();
  await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "false");
  await expect(likeButton(page, story.title)).toHaveAccessibleName(/0 likes$/);

  // Double-click / double-tap the cover: likes (and never navigates away).
  const cover = card(page, story.title).locator("img").first();
  await cover.scrollIntoViewIfNeeded();
  await cover.dblclick();
  await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect.poll(async () => (await articleData(reader.api, story.slug)).article?.likeCount).toBe(1);
  expect(errors()).toEqual([]);
});

test("logged out: liking needs no account and sticks after a reload; following opens the auth prompt", async ({
  page,
  createTestUser,
}) => {
  const publisher = await createTestUser();
  const story = await publish(publisher);
  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  const dialog = page.getByRole("dialog");
  const liked = page.waitForResponse((r) => r.url().endsWith(`/api/articles/${story.id}/like`) && r.request().method() === "POST");
  await likeButton(page, story.title).click();
  expect((await liked).ok()).toBe(true);
  await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "true");
  await expect(likeButton(page, story.title)).toHaveAccessibleName(/1 like$/);
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await revealCard(page, story.title);
  await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "true");
  await likeButton(page, story.title).click();
  await expect(likeButton(page, story.title)).toHaveAccessibleName(/0 likes$/);

  await followButton(page, story.title, publisher.username!).click();
  await expect(dialog.getByRole("link", { name: "Log in" })).toBeVisible();
});

test("follow from a story card", async ({ page, context, createTestUser }) => {
  const publisher = await createTestUser();
  const reader = await createTestUser();
  const story = await publish(publisher);
  await loginAs(context, reader);

  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  const follow = followButton(page, story.title, publisher.username!);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  // The reel's Follow badge goes once the follow lands; the profile shows "Following".
  await expect(follow).toHaveCount(0);

  await page.reload();
  await revealCard(page, story.title);
  await expect(followButton(page, story.title, publisher.username!)).toHaveCount(0);
  await gotoHydrated(page, `/${publisher.username}`);
  await expect(
    page.getByRole("main").getByRole("button", { name: `Following @${publisher.username}` }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  // No Follow button on your own stories.
  const own = await publish(reader);
  await gotoHydrated(page, LATEST);
  await revealCard(page, own.title);
  await expect(card(page, own.title).getByRole("button", { name: /^Follow / })).toHaveCount(0);
});

test("share → copy link copies the short link and increments the share count", async ({ page, context, baseURL, createTestUser }) => {
  const publisher = await createTestUser();
  const story = await publish(publisher);
  expect(story.shortCode, "every published story gets a short share code").toMatch(/^[a-z0-9]{7}$/);
  // Force the share menu (no native share sheet) and allow clipboard access.
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const errors = trackPageErrors(page);

  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  const share = card(page, story.title).getByRole("button", { name: /^Share/ });
  await expect(share).toHaveAccessibleName(/0 shares$/);
  await share.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "WhatsApp" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "LinkedIn" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Copy link" }).click();

  await expect(page.getByText("Link copied")).toBeVisible();
  await expect(share).toHaveAccessibleName(/1 share$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/s/${story.shortCode}`);
  await expect.poll(async () => (await articleData(publisher.api, story.slug)).article?.shareCount).toBe(1);
  // The short link redirects to the story with a relative Location (so it keeps whatever host the reader used), uncached.
  const redirect = await page.request.get(`/s/${story.shortCode}`, { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers()["location"]).toBe(`/a/${story.slug}`);
  expect(redirect.headers()["cache-control"]).toBe("no-store");
  expect(errors()).toEqual([]);
});

test("views are counted once per viewer (feed card and article page)", async ({ page, createTestUser }) => {
  const publisher = await createTestUser();
  const story = await publish(publisher);
  // Other parallel tests' feeds may view this story too, so judge by what the API says about OUR viewer.
  const results: boolean[] = [];
  page.on("response", async (res) => {
    if (!res.url().endsWith("/api/views") || !(res.request().postData() ?? "").includes(story.id)) return;
    const body = (await res.json().catch(() => ({ counted: [] }))) as { counted: string[] };
    results.push(body.counted.includes(story.id));
  });
  const reported = (count: number) => expect.poll(() => results.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count);
  // A feed view needs the card ≥50% on screen for ≥1 s. Parallel suites keep publishing, and near the top
  // their live stories slide in above ours and push it off a phone screen — so keep re-centring it.
  const seenInFeed = (count: number) =>
    expect
      .poll(
        async () => {
          if (results.length < count) {
            await card(page, story.title)
              .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }))
              .catch(() => undefined);
          }
          return results.length;
        },
        { timeout: 30_000, intervals: [1_500] },
      )
      .toBeGreaterThanOrEqual(count);

  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  await seenInFeed(1);
  expect(results[0]).toBe(true);
  await expect.poll(async () => (await articleData(publisher.api, story.slug)).article?.viewCount ?? 0).toBeGreaterThanOrEqual(1);

  // Same viewer opens the article (a view is sent on open) and scrolls the feed again: not counted again.
  await gotoHydrated(page, `/a/${story.slug}`);
  await reported(2);
  expect(results[1]).toBe(false);
  await gotoHydrated(page, LATEST);
  await revealCard(page, story.title);
  await seenInFeed(3);
  expect(results[2]).toBe(false);
});

test("article page: headline, body, no source link, metadata and more from the author", async ({ page, baseURL, createTestUser }) => {
  const publisher = await createTestUser();
  const earlier = await publish(publisher);
  const story = await publish(publisher, {
    title: `Source check ${randomLetters(8)}`,
    linkUrl: "https://www.example.org/reports/transit",
    bodyHtml: "<p>The report lists every change to the timetable and who pays for it.</p><blockquote><p>A quote.</p></blockquote>",
  });
  const errors = trackPageErrors(page);

  const response = await gotoHydrated(page, `/a/${story.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: story.title })).toBeVisible();
  await expect(page.locator(".prose-news blockquote")).toContainText("A quote.");

  // Stories carry no separate source link: the publisher is the source.
  await expect(page.locator('main a[href*="example.org"]')).toHaveCount(0);

  await expect(page).toHaveTitle(new RegExp(story.title));
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", story.title);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", new RegExp(`^${baseURL}/media/covers/`));
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

  const more = page.getByRole("region", { name: new RegExp(`More from @${escapeRe(publisher.username!)}`, "i") });
  await expect(more.getByRole("link", { name: new RegExp(earlier.title) })).toBeVisible();
  // Not the owner → no Delete.
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test("owner deletes a story from its page", async ({ page, context, createTestUser }) => {
  const publisher = await createTestUser();
  const story = await publish(publisher);
  await loginAs(context, publisher);

  await gotoHydrated(page, `/a/${story.slug}`);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this story?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete story" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Story deleted")).toBeVisible();
  await expect(card(page, story.title)).toHaveCount(0);
  expect((await articleData(publisher.api, story.slug)).status).toBe(404);
});

test("unknown story slugs show the branded 404 (noindex)", async ({ page }) => {
  // The (main) group streams (loading.tsx), so Next answers a soft 404: 200 + robots noindex.
  await page.goto(`/a/no-such-story-${randomLetters(8)}`);
  await expect(page.getByRole("heading", { name: "This story isn’t on the wire" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("link", { name: "Back to the feed" })).toBeVisible();
});

test("Following tab: logged-out prompt, empty state, then live stories from followed publishers", async ({
  page,
  context,
  createTestUser,
}) => {
  await gotoHydrated(page, "/?tab=following");
  await expect(page.getByRole("heading", { name: "Your own front page" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Log in" })).toHaveAttribute("href", /next=/);

  const reader = await createTestUser();
  const publisher = await createTestUser();
  await loginAs(context, reader);
  await gotoHydrated(page, "/?tab=following");
  await expect(page.getByRole("heading", { name: "Your Following feed is empty" })).toBeVisible();

  // Follow a publisher who hasn't published yet, then watch their first story arrive live.
  expect((await reader.api.post(`/api/users/${publisher.username}/follow`)).ok()).toBe(true);
  const streamOpen = waitForStream(page);
  await gotoHydrated(page, "/?tab=following");
  await streamOpen;
  const story = await publishStory(publisher, `Followed live ${randomLetters(8)}`);
  await expect(card(page, story.title)).toBeVisible({ timeout: 15_000 });
});

test("realtime: a story published elsewhere slides in on top; scrolled readers get the pill and keep their place", async ({
  page,
  createTestUser,
}) => {
  const publisher = await createTestUser();
  // Reduced motion: the pill jumps to the top instantly, so the assertion doesn't depend on smooth-scroll timing.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = trackPageErrors(page);
  const streamOpen = waitForStream(page);
  await gotoHydrated(page, LATEST);
  await streamOpen;
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  const feedOrder = () => page.locator("[data-feed-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-feed-item")));
  const topBefore = (await feedOrder())[0];

  const first = await publish(publisher, { title: `Live top ${randomLetters(8)}` });
  await expect(card(page, first.title)).toBeVisible({ timeout: 15_000 });
  // On top of everything that was there before (parallel suites may slide in newer stories meanwhile).
  const afterFirst = await feedOrder();
  const position = afterFirst.indexOf(first.id);
  expect(position).toBeGreaterThanOrEqual(0);
  const topBeforeIndex = topBefore ? afterFirst.indexOf(topBefore) : -1;
  if (topBeforeIndex >= 0) expect(position).toBeLessThan(topBeforeIndex);
  expect(position).toBeLessThan(8);
  await expect(card(page, first.title).getByText("Just in")).toBeVisible();

  // Scroll well down, remember what's on screen, then publish again.
  await page.evaluate(() => window.scrollTo({ top: 1800, behavior: "instant" }));
  await page.waitForTimeout(300);
  const anchorBefore = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll<HTMLElement>("[data-feed-item]")).find(
      (n) => n.getBoundingClientRect().bottom > 120,
    );
    return node ? { id: node.dataset.feedItem!, top: node.getBoundingClientRect().top } : null;
  });
  expect(anchorBefore).not.toBeNull();

  const second = await publish(publisher, { title: `Live pill ${randomLetters(8)}` });
  await expect(page.locator(`[data-feed-item="${second.id}"]`)).toHaveCount(1, { timeout: 15_000 });
  const pill = page.getByRole("button", { name: /new stor(y|ies)/ });
  await expect(pill).toBeVisible();
  const anchorTop = await page.evaluate(
    (id) => document.querySelector<HTMLElement>(`[data-feed-item="${id}"]`)!.getBoundingClientRect().top,
    anchorBefore!.id,
  );
  expect(Math.abs(anchorTop - anchorBefore!.top)).toBeLessThan(3);

  await pill.click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 20_000 }).toBeLessThan(5);
  const order = await page
    .locator("[data-feed-item]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-feed-item")));
  const secondIndex = order.indexOf(second.id);
  expect(secondIndex).toBeGreaterThanOrEqual(0);
  // On top of everything that was there before it (parallel suites may publish newer stories meanwhile).
  expect(secondIndex).toBeLessThan(order.indexOf(first.id));
  expect(secondIndex).toBeLessThan(order.indexOf(anchorBefore!.id));
  expect(secondIndex).toBeLessThan(8);
  await expect(pill).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  expect(errors()).toEqual([]);
});

test("realtime: a like in one browser updates the count in another; deletions disappear live", async ({
  page,
  context,
  browser,
  baseURL,
  createTestUser,
}, testInfo) => {
  const publisher = await createTestUser();
  const reader = await createTestUser();
  const story = await publish(publisher);
  await loginAs(context, reader);

  const other = await newProjectContext(browser, testInfo, baseURL);
  const watcher = await other.newPage();
  try {
    const watcherStream = waitForStream(watcher);
    await gotoHydrated(watcher, LATEST);
    await watcherStream;
    await revealCard(watcher, story.title);
    await expect(likeButton(watcher, story.title)).toHaveAccessibleName(/0 likes$/);

    await gotoHydrated(page, LATEST);
    await revealCard(page, story.title);
    await likeButton(page, story.title).click();
    await expect(likeButton(page, story.title)).toHaveAttribute("aria-pressed", "true");

    await expect(likeButton(watcher, story.title)).toHaveAccessibleName(/1 like$/, { timeout: 10_000 });
    await expect(likeButton(watcher, story.title)).toHaveAttribute("aria-pressed", "false");

    expect((await publisher.api.delete(`/api/articles/${story.id}`)).status()).toBe(204);
    await expect(card(watcher, story.title)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await other.close();
  }
});
