import type { Page } from "@playwright/test";
import type { DraftCard, Page as ApiPage } from "../../lib/shared/contracts";
import {
  expect,
  gotoHydrated,
  loginAs,
  publishStory,
  randomLetters,
  samplePng,
  test,
  trackConsoleErrors,
} from "./fixtures";

/*
 * Composer / publish flow (SPEC §3.8). Every test signs in its own fixture user — a Verified Reporter,
 * since only Reporters and the Editor Desk may publish (SPEC §3.11); drafts and stories are removed
 * with that user by global teardown.
 */

const UUID_PATH = /\/publish\/([0-9a-f-]{36})$/;

// Each test creates users, uploads and compiles routes in `next dev`: give the file a roomier budget.
test.describe.configure({ timeout: 90_000 });

// `next dev` compiles routes on first hit; warm the composer routes before the tests start.
test.beforeAll(async ({ baseURL }) => {
  for (const path of ["/publish", "/publish/00000000-0000-4000-8000-000000000000"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual", signal: AbortSignal.timeout(60_000) }).catch(
      () => undefined,
    );
  }
});

async function addCover(page: Page) {
  await page
    .getByTestId("cover-input")
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: samplePng() });
  const crop = page.getByRole("dialog", { name: "Crop your cover" });
  await expect(crop).toBeVisible();
  await crop.getByRole("button", { name: "Crop & upload" }).click();
  // Cropping (canvas) + upload + sharp re-encode can take a while on a busy machine.
  await expect(crop).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Cover image preview" })).toBeVisible({ timeout: 30_000 });
}

const storyEditor = (page: Page) => page.getByRole("textbox", { name: "Story" });
const headline = (page: Page) => page.getByRole("textbox", { name: "Headline" });
const templatePicker = (page: Page) => page.getByRole("radiogroup", { name: "Choose a template" });
const templateRadio = (page: Page, name: string) => templatePicker(page).getByRole("radio", { name, exact: true });
const categorySelect = (page: Page) => page.getByRole("combobox", { name: "Category" });
const districtSelect = (page: Page) => page.getByRole("combobox", { name: "District" });
const actionButton = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

test("write → crop → preview → save draft → reopen → publish lands on its category page", async ({
  page,
  context,
  createTestUser,
}) => {
  test.setTimeout(180_000); // the longest journey in the suite (uploads, two page loads, publish)
  const user = await createTestUser({ role: "reporter" });
  await loginAs(context, user);
  const errors = trackConsoleErrors(page);
  const title = `Harbour night market stays open ${randomLetters(6)}`;

  await gotoHydrated(page, "/publish");
  await expect(page.getByRole("heading", { name: "File a story" })).toBeVisible();

  // 01 Write — cover (file picker → 16:9 crop → upload), headline, category (+ district), template, formatted story.
  await addCover(page);
  await headline(page).fill(title);
  await expect(districtSelect(page)).toHaveCount(0);
  await categorySelect(page).selectOption("karnataka");
  await districtSelect(page).selectOption("Mysuru");
  // No template is preselected: the reporter picks one.
  await expect(templatePicker(page).getByRole("radio", { checked: true })).toHaveCount(0);
  await templateRadio(page, "Newspaper").check();
  await expect(templateRadio(page, "Newspaper")).toBeChecked();

  await storyEditor(page).click();
  await page.keyboard.type("After a four-hour hearing the council backed the traders ");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.keyboard.type("seven votes to two");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.keyboard.type(".");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("Stalls may trade until 2 a.m.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Late buses every 20 minutes");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Read the ");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Add link" });
  await linkDialog.getByLabel("Web address").fill("https://council.example/minutes");
  await linkDialog.getByRole("button", { name: "Add link" }).click();
  await expect(linkDialog).toBeHidden();
  await page.keyboard.type(" before the vote.");

  const editor = storyEditor(page);
  await expect(editor.locator("strong")).toHaveText("seven votes to two");
  await expect(editor.locator("ul > li")).toHaveCount(2);
  await expect(editor.locator('a[href="https://council.example/minutes"]')).toHaveText(
    "https://council.example/minutes",
  );

  // 02 Preview — the reel poster (in the chosen template) and the full article, rendered in preview mode.
  await actionButton(page, "Preview").click();
  const preview = page.locator("[data-composer-preview]");
  await expect(page.getByText("Ready to publish.")).toBeVisible();
  await expect(preview.locator('[data-poster="newspaper"]')).toContainText(title);
  await expect(preview).toContainText("Newspaper template");
  await page.getByRole("radio", { name: "Full article" }).click();
  await expect(preview.getByRole("heading", { name: title })).toBeVisible();
  await expect(preview).toContainText("Mysuru, Karnataka");
  await expect(preview.locator("strong", { hasText: "seven votes to two" })).toBeVisible();
  await expect(preview.locator("li", { hasText: "Late buses every 20 minutes" })).toBeVisible();
  await expect(preview.locator('a[href="https://council.example/minutes"]')).toBeVisible();

  // Save draft → the URL becomes /publish/<id> in place and the draft is listed by the API.
  await actionButton(page, /^Save( draft)?$/).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.waitForURL(UUID_PATH);
  const draftId = UUID_PATH.exec(new URL(page.url()).pathname)![1]!;
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();

  const drafts = (await (await user.api.get(`/api/users/${user.username}/drafts`)).json()) as ApiPage<DraftCard>;
  expect(drafts.items.find((d) => d.id === draftId)?.title).toBe(title);

  // Reopen the draft: everything comes back from the server.
  await gotoHydrated(page, `/publish/${draftId}`);
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await expect(headline(page)).toHaveValue(title);
  await expect(categorySelect(page)).toHaveValue("karnataka");
  await expect(districtSelect(page)).toHaveValue("Mysuru");
  await expect(templateRadio(page, "Newspaper")).toBeChecked();
  await expect(page.getByRole("img", { name: "Cover image preview" })).toBeVisible();
  await expect(storyEditor(page).locator("strong")).toHaveText("seven votes to two");
  await expect(storyEditor(page).locator("ul > li")).toHaveCount(2);

  // Publish → "You're live" moment → its category page (Mysuru, Karnataka; newest first), with the story at the top.
  await actionButton(page, "Preview").click();
  await actionButton(page, "Publish").click();
  await expect(page.getByRole("status", { name: "Your story is live" })).toBeVisible();
  await page.waitForURL((url) => url.pathname === "/category/karnataka/mysuru", { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /Karnataka · Mysuru/ })).toBeVisible();
  await expect(page.getByText("Your story is live", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View story" })).toBeVisible();

  const cards = page.locator("main article[data-story-id]");
  await expect(cards.filter({ hasText: title })).toHaveCount(1, { timeout: 30_000 });
  const titles = await cards.evaluateAll((nodes) => nodes.slice(0, 3).map((n) => n.textContent ?? ""));
  expect(titles.some((text) => text.includes(title))).toBe(true);

  // The draft is gone (it became the story).
  const after = (await (await user.api.get(`/api/users/${user.username}/drafts`)).json()) as ApiPage<DraftCard>;
  expect(after.items.some((d) => d.id === draftId)).toBe(false);

  expect(errors).toEqual([]);
});

test("publishing without a cover, headline, category, template or enough text is blocked with messages", async ({
  page,
  context,
  createTestUser,
}) => {
  const user = await createTestUser({ role: "reporter" });
  await loginAs(context, user);
  await gotoHydrated(page, "/publish");

  // Nothing at all: a draft needs something to save.
  await actionButton(page, /^Save( draft)?$/).click();
  await expect(page.getByText("Add a headline, an image or some text before saving a draft")).toBeVisible();

  await storyEditor(page).click();
  await page.keyboard.type("Too short to run.");

  await actionButton(page, "Preview").click();
  await expect(page.getByText("Not ready to publish yet")).toBeVisible();
  // The readiness checklist asks for the template too, and the poster preview says none is chosen yet.
  await expect(actionButton(page, "Choose a template")).toBeVisible();
  await expect(page.locator("[data-composer-preview]")).toContainText("Choose a template to see your poster");
  await actionButton(page, "Publish").click();

  // Back on Write with every problem highlighted.
  await expect(page.getByText("Your story isn't ready to publish yet")).toBeVisible();
  await expect(page.locator("#composer-cover-section-error")).toHaveText("Add a cover image or a video");
  await expect(page.locator("#composer-title-section-error")).toHaveText("Add a headline");
  await expect(page.locator("#composer-category-section-error")).toHaveText("Choose a category");
  await expect(page.locator("#composer-template-section-error")).toHaveText("Choose a template");
  await expect(page.locator("#composer-story-section-error")).toHaveText("Write at least 30 characters");
  await expect(headline(page)).toHaveAttribute("aria-invalid", "true");
  await expect(templatePicker(page)).toHaveAttribute("aria-invalid", "true");
  expect(new URL(page.url()).pathname).toBe("/publish");

  // Fixing a field clears its message.
  await headline(page).fill("A headline at last");
  await expect(page.locator("#composer-title-section-error")).toHaveCount(0);
  await templateRadio(page, "Classic").check();
  await expect(page.locator("#composer-template-section-error")).toHaveCount(0);

  // Nothing was created.
  const drafts = (await (await user.api.get(`/api/users/${user.username}/drafts`)).json()) as ApiPage<DraftCard>;
  expect(drafts.items).toHaveLength(0);
});

test("unsaved work survives a reload and in-app navigation asks first", async ({ page, context, createTestUser }) => {
  const user = await createTestUser({ role: "reporter" });
  await loginAs(context, user);
  await gotoHydrated(page, "/publish");

  const title = `Kept on this device ${randomLetters(5)}`;
  await headline(page).fill(title);
  await expect(page.getByText("Unsaved changes · kept on this device")).toBeVisible();
  await page.waitForTimeout(800); // autosave debounce

  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(headline(page)).toHaveValue(title);
  await expect(page.getByText("Restored your unsaved changes")).toBeVisible();

  // Clicking an in-app link holds the navigation behind a confirmation.
  await page.getByRole("link", { name: "WebNEWS home" }).filter({ visible: true }).click();
  const leave = page.getByRole("dialog", { name: "Leave this story?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Keep writing" }).click();
  await expect(leave).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/publish");

  await page.getByRole("link", { name: "WebNEWS home" }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "Leave this story?" }).getByRole("button", { name: "Leave anyway" }).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("the composer is for signed-in writers; drafts are private; published stories open their page", async ({
  page,
  context,
  createTestUser,
}) => {
  await gotoHydrated(page, "/publish");
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/publish");

  const owner = await createTestUser({ role: "reporter" });
  const other = await createTestUser();

  const draftRes = await owner.api.post("/api/articles", {
    data: { title: `Private draft ${randomLetters(5)}`, action: "draft" },
  });
  expect(draftRes.ok()).toBe(true);
  const draft = ((await draftRes.json()) as { article: { id: string } }).article;

  // Not the owner: the branded not-found view (the shell streams, so the HTTP status stays 200 in dev).
  await loginAs(context, other);
  await gotoHydrated(page, `/publish/${draft.id}`);
  await expect(page.getByRole("heading", { name: /isn.t on the wire/ })).toBeVisible();
  await expect(headline(page)).toHaveCount(0);

  await context.clearCookies();
  await loginAs(context, owner);
  await gotoHydrated(page, `/publish/${draft.id}`);
  await expect(headline(page)).toHaveValue(/Private draft/);

  // A published story isn't editable: its composer URL forwards to the article page.
  const story = await publishStory(owner);
  await page.goto(`/publish/${story.id}`, { waitUntil: "commit" });
  await page.waitForURL((url) => url.pathname === `/a/${story.slug}`);
});

test("a draft can be deleted from the composer", async ({ page, context, createTestUser }) => {
  const user = await createTestUser({ role: "reporter" });
  const res = await user.api.post("/api/articles", {
    data: { title: `Scrapped draft ${randomLetters(5)}`, action: "draft" },
  });
  expect(res.ok()).toBe(true);
  const draft = ((await res.json()) as { article: { id: string } }).article;

  await loginAs(context, user);
  await gotoHydrated(page, `/publish/${draft.id}`);
  await page.getByRole("button", { name: "Delete draft" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this draft?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByText("Draft deleted", { exact: true })).toBeVisible();
  await page.waitForURL((url) => url.pathname === `/${user.username}`);
  const drafts = (await (await user.api.get(`/api/users/${user.username}/drafts`)).json()) as ApiPage<DraftCard>;
  expect(drafts.items.some((d) => d.id === draft.id)).toBe(false);
});
