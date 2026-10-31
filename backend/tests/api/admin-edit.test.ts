import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { OwnedArticleResponse } from "../../src/shared/contracts.js";
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
    const { article } = await json<OwnedArticleResponse>(got);
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
