import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { SearchResults } from "../../src/shared/contracts.js";
import { cleanupFixtures, client, freshApp, json, publishArticle, randomLetters, reporterUser } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const search = async (q: string) => json<SearchResults>(await client(app).req(`/api/search?q=${encodeURIComponent(q)}`));

describe("instant search", () => {
  it("finds people by username or name and public stories by headline, as you type", async () => {
    const tag = randomLetters(8);
    const reporter = await reporterUser(app, { username: `find.${tag}` });
    const story = await publishArticle(reporter, `Lighthouse keeper ${tag} retires after forty years`);
    const draft = await reporter.req("/api/articles", { json: { title: `Unpublished ${tag} draft`, action: "draft" } });
    expect(draft.status).toBeLessThan(300);

    // A few letters of the username (with or without "@") → the person, first.
    expect((await search(`find.${tag.slice(0, 4)}`)).users[0]?.username).toBe(`find.${tag}`);
    expect((await search(`@find.${tag}`)).users.map((u) => u.username)).toEqual([`find.${tag}`]);
    // Words of the headline → the story; drafts never show up.
    const byTitle = await search(tag);
    expect(byTitle.stories.map((s) => s.id)).toEqual([story.id]);
    expect((await search(`lighthouse keeper ${tag}`)).stories[0]?.slug).toBe(story.slug);
    // Wildcards are literal; an empty query returns nothing.
    expect(await search("%%%")).toMatchObject({ users: [], stories: [] });
    expect(await search("   ")).toEqual({ query: "", users: [], stories: [] });
  });
});
