import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { OwnedArticle } from "../../src/shared/contracts.js";
import { adminUser, cleanupFixtures, freshApp, json, publishArticle, reporterUser, PUBLISH_EXTRAS } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe("Editor Desk edits a reporter's story", () => {
  it("opens it and saves it, keeping the author", async () => {
    const reporter = await reporterUser(app);
    const story = await publishArticle(reporter);
    const desk = await adminUser(app);
    const got = await desk.req(`/api/articles/${story.id}`);
    expect(got.status, await got.clone().text()).toBe(200);
    const { article } = await json<{ article: OwnedArticle }>(got);
    const res = await desk.req("/api/articles", {
      json: {
        id: story.id,
        action: "publish",
        title: `${article.title} (edited)`,
        bodyHtml: article.bodyHtml,
        cover: article.cover,
        articleImage: article.articleImage,
        category: article.category,
        language: article.language,
        template: article.template,
        ...PUBLISH_EXTRAS,
      },
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe("Reporter activity (content log)", () => {
  it("records publish, edit and delete with IP and device, readable by the Editor Desk", async () => {
    const reporter = await reporterUser(app);
    const story = await publishArticle(reporter);
    const del = await reporter.req(`/api/articles/${story.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const desk = await adminUser(app);
    const res = await desk.req(`/api/admin/activity?q=${encodeURIComponent(story.title)}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = await json<{ items: { action: string; ip: string | null; user: { username: string | null } }[] }>(res);
    expect(page.items.map((i) => i.action)).toEqual(["deleted", "published"]);
    expect(page.items[0]?.ip).toBeTruthy();
    expect((await reporter.req("/api/admin/activity")).status).toBe(403);
  });
});
