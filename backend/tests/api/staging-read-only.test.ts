import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import { env } from "../../src/env.js";
import { cleanupFixtures, freshApp, json, onboardedUser, publishArticle, reporterUser } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  Object.assign(env, { stagingReadOnly: false });
  await cleanupFixtures();
  await closeDatabase();
});

describe("Staging read-only mode (STAGING_READ_ONLY=1)", () => {
  it("reads work, real engagement can't be written, background counting is silently ignored", async () => {
    const reporter = await reporterUser(app);
    const story = await publishArticle(reporter);
    const reader = await onboardedUser(app);
    Object.assign(env, { stagingReadOnly: true });
    expect((await reader.req(`/api/articles/by-slug/${story.slug}`)).status).toBe(200);
    const like = await reader.req(`/api/articles/${story.id}/like`, { method: "POST" });
    expect(like.status).toBe(403);
    expect((await json<{ error: { code: string } }>(like)).error.code).toBe("staging_read_only");
    expect((await reader.req(`/api/articles/${story.id}/comments`, { json: { body: "hello" } })).status).toBe(403);
    const views = await reader.req("/api/views", { json: { ids: [story.id] } });
    expect(views.status).toBe(200);
    expect(await json(views)).toEqual({ counted: [] });
    Object.assign(env, { stagingReadOnly: false });
  });
});
