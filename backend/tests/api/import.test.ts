import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import { env } from "../../src/env.js";
import { cleanupFixtures, client, freshApp, onboardedUser, samplePng } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  vi.unstubAllGlobals();
  await cleanupFixtures();
  await closeDatabase();
});

describe("POST /api/import/story (scheduled morning import)", () => {
  it("needs the token, publishes under the import account, and skips a repeat", async () => {
    const desk = await onboardedUser(app);
    Object.assign(env, { IMPORT_TOKEN: "test-import-token-123", IMPORT_AUTHOR_USERNAME: desk.username });
    // The source image, served without the network.
    const png = await samplePng();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://static.pib.gov.in/") ? Promise.resolve(new Response(new Uint8Array(png), { status: 200 })) : realFetch(input, init),
    );
    const story = {
      title: `Test import headline ${Date.now()}`,
      blurb: "A short summary of the imported story that is long enough for the blurb rule.",
      paragraphs: ["First paragraph of the story.", "Second paragraph of the story."],
      imageUrl: "https://static.pib.gov.in/WriteReadData/userfiles/image/2026/oct/test.jpg",
      sourceName: "Press Information Bureau (PIB), Government of India",
      photoCredit: "PIB",
      category: "national",
      subcategory: "Other",
    };
    const anon = client(app);
    expect((await anon.req("/api/import/story", { json: story })).status).toBe(401);
    const auth = { authorization: "Bearer test-import-token-123" };
    const res = await anon.req("/api/import/story", { json: story, headers: auth });
    expect(res.status, await res.clone().text()).toBe(201);
    const again = await (await anon.req("/api/import/story", { json: story, headers: auth })).json();
    expect(again).toMatchObject({ status: "skipped" });
    const bad = await anon.req("/api/import/story", { json: { ...story, title: `${story.title} 2`, imageUrl: "https://example.com/x.jpg" }, headers: auth });
    expect(bad.status).toBe(400);
  });
});
