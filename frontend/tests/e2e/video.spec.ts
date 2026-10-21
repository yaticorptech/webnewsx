import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, gotoHydrated, loginAs, randomLetters, test, trackConsoleErrors } from "./fixtures";

/*
 * Story videos (owner rule 2026-09-25): a story's media is an image OR a video of at most 30 seconds. A longer clip
 * asks "keep the first 30 seconds?" before anything is uploaded. Feed videos play muted on their own.
 * The clips are generated with the backend's bundled ffmpeg (test pattern + tone).
 */

const ffmpeg = createRequire(resolve(__dirname, "../../../backend/package.json"))("ffmpeg-static") as string;
let dir = "";
const clips: Record<"short" | "long", Buffer> = { short: Buffer.alloc(0), long: Buffer.alloc(0) };

function makeClip(seconds: number, name: string): Buffer {
  const path = join(dir, name);
  execFileSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc=size=480x270:rate=24:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=330:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", path,
  ]);
  return readFileSync(path);
}

test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "webnews-e2e-video-"));
  clips.short = makeClip(4, "short.mp4");
  clips.long = makeClip(35, "long.mp4");
});

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function writeStory(page: Page, title: string) {
  await page.getByRole("textbox", { name: "Headline" }).fill(title);
  await page.getByRole("combobox", { name: "Category" }).selectOption("cinema");
  // Publishing needs a reel poster template (nothing is preselected).
  await page.getByRole("radiogroup", { name: "Choose a template" }).getByRole("radio", { name: "Classic", exact: true }).check();
  await page.getByRole("textbox", { name: "Story" }).click();
  await page.keyboard.type("Filmed from the harbour wall as the evening ferry came in, for the end-to-end suite.");
}

test("a video over 30 seconds asks first, keeps the first 30 seconds, and plays in the feed and on the story", async ({
  page,
  context,
  createTestUser,
}) => {
  const user = await createTestUser({ role: "reporter" });
  await loginAs(context, user);
  const errors = trackConsoleErrors(page);
  const title = `Evening ferry in motion ${randomLetters(6)}`;

  await gotoHydrated(page, "/publish");
  await page.getByTestId("cover-input").setInputFiles({ name: "ferry.mp4", mimeType: "video/mp4", buffer: clips.long });

  const ask = page.getByRole("dialog", { name: "This video is 35 seconds long" });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Story videos can be 30 seconds at most");
  await ask.getByRole("button", { name: "Use the first 30 seconds" }).click();
  await expect(ask).toBeHidden();

  const media = page.getByTestId("cover-video");
  await expect(media).toBeVisible({ timeout: 60_000 });
  await expect(media).toContainText(/Video · 0:(29|30)/);
  await expect(page.getByText("We kept the first 30 seconds")).toBeVisible();

  await writeStory(page, title);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  // The reel poster (the default preview) and the full article both play the clip.
  await page.getByRole("radio", { name: "Full article" }).click();
  await expect(page.locator("[data-composer-preview] video")).toHaveCount(1);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/category/cinema", { timeout: 30_000 });

  // The feed reel plays the clip muted inside its poster, on its own, with a sound switch.
  const card = page.locator("main article[data-story-id]").filter({ hasText: title });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  const clip = card.locator("[data-poster] video");
  await expect(clip).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => !v.paused && v.muted), { timeout: 15_000 }).toBe(true);
  await card.getByRole("button", { name: "Turn sound on" }).click();
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expect(card.getByRole("button", { name: "Turn sound off" })).toBeVisible();

  // The story page shows the same clip in the hero.
  const story = (await (await user.api.get(`/api/users/${user.username}/articles`)).json()) as { items: Array<{ slug: string; title: string }> };
  const slug = story.items.find((item) => item.title === title)?.slug;
  expect(slug).toBeTruthy();
  await gotoHydrated(page, `/a/${slug}`);
  await expect(page.locator("main article video")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a short video uploads straight away and can be removed again", async ({ page, context, createTestUser }) => {
  const user = await createTestUser({ role: "reporter" });
  await loginAs(context, user);
  await gotoHydrated(page, "/publish");
  await page.getByTestId("cover-input").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: clips.short });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const media = page.getByTestId("cover-video");
  await expect(media).toBeVisible({ timeout: 60_000 });
  await expect(media).toContainText(/Video · 0:0[34]/);
  await media.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: /Add a cover image or video/ })).toBeVisible();
});
