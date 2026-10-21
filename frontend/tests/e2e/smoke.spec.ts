import { expect, gotoHydrated, loginAs, navProfileLink, publishStory, randomLetters, test, trackConsoleErrors, waitForHydration, waitForStream } from "./fixtures";

/*
 * Foundation smoke suite: shell + auth through the rewrite proxy + realtime + the single light theme + mobile nav.
 * Runs in both projects (desktop 1440 / mobile 390). Non-destructive: only fixture users/stories.
 */

const noHorizontalOverflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

test("shell renders with live data and no console errors", async ({ page, createTestUser, isMobile }) => {
  const publisher = await createTestUser();
  const story = await publishStory(publisher, `Shell check ${randomLetters(8)}`);
  const errors = trackConsoleErrors(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "WebNEWS home" })).toBeVisible();
  const ticker = page.getByRole("region", { name: "Live headlines" });
  await expect(ticker.getByRole("link", { name: new RegExp(story.title) })).toBeAttached();
  // Masthead category nav (Home · Following · sections · Karnataka ▾ · Astrology · More ▾); Home is "/".
  const sections = page.getByRole("navigation", { name: "Sections" });
  await expect(sections).toBeVisible();
  await expect(sections.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  const rail = page.getByRole("complementary", { name: "Trending now" });
  if (isMobile) {
    await expect(rail).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  } else {
    // Owner rule 2026-09-25: the rail is Trending now + the footer's office address — no Live Wire, no Publishers to follow.
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("heading", { name: /Trending now/ })).toBeVisible();
    await expect(rail.getByText("Webnews Network Private Limited").first()).toBeVisible();
    await expect(rail.getByRole("heading", { name: /Live Wire|Publishers to follow/ })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  }

  expect(await page.evaluate(noHorizontalOverflow)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("sign-up + onboarding via the API → avatar in the nav", async ({ page, context, baseURL, createTestUser }) => {
  const user = await createTestUser({ onboarded: true });
  // The session cookie was set through the Next.js rewrite, i.e. first-party on the app origin.
  const session = user.cookies.find((cookie) => cookie.name.endsWith("session_token"));
  expect(session?.domain).toBe(new URL(baseURL!).hostname);
  expect(session?.httpOnly).toBe(true);

  await loginAs(context, user);
  const errors = trackConsoleErrors(page);
  await page.goto("/");

  const avatarLink = navProfileLink(page, user.username!);
  await expect(avatarLink).toBeVisible();
  await expect(avatarLink).toHaveAttribute("href", `/${user.username}`);
  await expect(avatarLink.locator("img")).toHaveAttribute("src", /\/media\/avatars\//);
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a signed-in user who hasn't onboarded is sent to /onboarding", async ({ page, context, createTestUser }) => {
  const user = await createTestUser({ onboarded: false });
  await loginAs(context, user);
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("realtime: a newly published story reaches the ticker without a reload", async ({ page, createTestUser }) => {
  const publisher = await createTestUser();
  const errors = trackConsoleErrors(page);
  const streamOpen = waitForStream(page);
  await page.goto("/");
  await streamOpen;
  await page.evaluate(() => ((window as unknown as { __e2eMarker: number }).__e2eMarker = 1));

  const story = await publishStory(publisher, `Live wire ${randomLetters(8)}`);

  const ticker = page.getByRole("region", { name: "Live headlines" });
  await expect(ticker.getByRole("link", { name: new RegExp(story.title) })).toBeAttached();
  // Same document: nothing reloaded.
  expect(await page.evaluate(() => (window as unknown as { __e2eMarker?: number }).__e2eMarker)).toBe(1);
  expect(errors).toEqual([]);
});

test("one light theme: white page, crimson accents, no theme toggle or dark mode", async ({ page }) => {
  await gotoHydrated(page, "/");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/\bdark\b/);
  // White page and card surfaces (SPEC §2.2); near-black is for text only.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  // The current section's chip is filled with the brand red (compared with a probe so the token value can change).
  const tabColor = await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Home" })
    .evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--brand)";
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { actual: getComputedStyle(el).backgroundColor, brand };
    });
  expect(tabColor.actual).toBe(tabColor.brand);
  await expect(page.getByRole("button", { name: /theme/i })).toHaveCount(0);

  // The OS dark preference changes nothing.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await waitForHydration(page);
  await expect(html).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
});

test("mobile bottom tab bar at 390px: Home · Log in / Home · Profile, no Publish", async ({ page, context, isMobile, createTestUser }) => {
  test.skip(!isMobile, "the bottom tab bar exists below 768px only");
  expect(page.viewportSize()?.width).toBe(390);
  await gotoHydrated(page, "/");
  const bar = page.getByRole("navigation", { name: "Primary" });
  await expect(bar).toBeVisible();
  // Home · + · Log in (owner 2026-09-28: the raised "+" is back; logged out it leads to Log in).
  await expect(bar.getByRole("listitem")).toHaveCount(3);
  await expect(bar.getByRole("link")).toHaveCount(3);
  await expect(bar.getByRole("link", { name: "Log in to post a story" })).toHaveAttribute("href", "/login");
  await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  // Not repeated at the top on phones (owner rule 2026-09-25): the masthead keeps search + the menu.
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("button", { name: "Search people and stories" }).filter({ visible: true })).toBeVisible();
  await expect(bar.getByRole("button")).toHaveCount(0);
  await expect(bar.getByText("Publish")).toHaveCount(0);
  const box = await bar.boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
  expect(await page.evaluate(noHorizontalOverflow)).toBeLessThanOrEqual(0);

  // Signed in: Home · Profile (the avatar), still no Publish.
  const user = await createTestUser();
  await loginAs(context, user);
  await gotoHydrated(page, "/");
  await expect(bar.getByRole("link")).toHaveCount(2);
  const profile = bar.getByRole("link", { name: "Profile" });
  await expect(profile).toHaveAttribute("href", `/${user.username}`);
  await expect(profile.locator("img")).toBeVisible();
  await expect(bar.getByText("Publish")).toHaveCount(0);
  await profile.click();
  await page.waitForURL((url) => url.pathname === `/${user.username}`);
  await expect(profile).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
});

test("logged-out follow opens the auth prompt; Google goes to accounts.google.com", async ({ page, baseURL, isMobile, createTestUser }) => {
  test.skip(isMobile, "the mobile prompt is covered above");
  // Make sure at least one publisher exists without relying on seed data.
  const publisher = await createTestUser();
  await publishStory(publisher);
  await gotoHydrated(page, "/?tab=latest");
  const follow = page.getByRole("main").getByRole("button", { name: /^Follow / }).first();
  const dialog = page.getByRole("dialog");
  await follow.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Create an account" })).toBeVisible();

  const google = dialog.getByRole("button", { name: "Continue with Google" });
  if ((await google.count()) > 0) {
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
  } else {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("unknown pages show the branded 404", async ({ page }) => {
  const response = await page.goto("/this/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This story isn’t on the wire" })).toBeVisible();
});
