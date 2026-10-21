import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { articleView } from "../../src/db/schema.js";
import { ANON_IP_FACTOR, RATE_LIMITS } from "../../src/lib/rate-limit.js";
import { verifyViewerId } from "../../src/lib/viewer-id.js";
import type { ApiErrorBody, ArticleCard, ArticleDetail, Page, ProfileData, UserRow } from "../../src/shared/contracts.js";
import { cleanupFixtures, client, freshApp, json, nextIp, onboardedUser, publishArticle, randomLetters, signUp, type Client, reporterUser } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

async function detail(slug: string, c: Client = client(app)): Promise<ArticleDetail> {
  return (await json<{ article: ArticleDetail }>(await c.req(`/api/articles/by-slug/${slug}`))).article;
}

describe("likes", () => {
  it("like / unlike are idempotent and move the counter", async () => {
    const author = await reporterUser(app);
    const fan = await onboardedUser(app);
    const other = await onboardedUser(app);
    const article = await publishArticle(author);
    const like = (c: Client, method: "POST" | "DELETE") => c.req(`/api/articles/${article.id}/like`, { method }).then((r) => json(r));

    expect(await like(fan, "POST")).toEqual({ liked: true, likeCount: 1 });
    expect(await like(fan, "POST")).toEqual({ liked: true, likeCount: 1 });
    expect(await like(other, "POST")).toEqual({ liked: true, likeCount: 2 });
    expect((await detail(article.slug, fan)).viewer.liked).toBe(true);
    expect((await detail(article.slug)).likeCount).toBe(2);

    expect(await like(fan, "DELETE")).toEqual({ liked: false, likeCount: 1 });
    expect(await like(fan, "DELETE")).toEqual({ liked: false, likeCount: 1 });
    expect((await detail(article.slug, fan)).viewer.liked).toBe(false);

    const feed = await json<Page<ArticleCard>>(await other.req("/api/feed?limit=30"));
    expect(feed.items.find((i) => i.id === article.id)?.viewer.liked).toBe(true);
  });

  it("logged-out visitors like once per browser (their anonymous id), and the counter moves", async () => {
    const author = await reporterUser(app);
    const article = await publishArticle(author);
    const visitor = client(app);
    const like = (c: Client, method: "POST" | "DELETE") => c.req(`/api/articles/${article.id}/like`, { method }).then((r) => json(r));

    expect(await like(visitor, "POST")).toEqual({ liked: true, likeCount: 1 });
    expect(visitor.cookie).toContain("wn_vid");
    expect(await like(visitor, "POST")).toEqual({ liked: true, likeCount: 1 });
    expect(await like(client(app), "POST")).toEqual({ liked: true, likeCount: 2 });
    expect(await like(visitor, "DELETE")).toEqual({ liked: false, likeCount: 1 });
    expect((await detail(article.slug)).likeCount).toBe(1);
  });

  it("an account needs onboarding, and the story must be published", async () => {
    const author = await reporterUser(app);
    const article = await publishArticle(author);
    const newbie = await signUp(app);
    expect((await newbie.req(`/api/articles/${article.id}/like`, { method: "POST" })).status).toBe(403);
    const fan = await onboardedUser(app);
    expect((await fan.req("/api/articles/00000000-0000-4000-8000-000000000000/like", { method: "POST" })).status).toBe(404);
    expect((await fan.req("/api/articles/not-a-uuid/like", { method: "POST" })).status).toBe(404);
    const draft = await json<{ article: { id: string } }>(await author.req("/api/articles", { json: { title: "Private", action: "draft" } }));
    expect((await fan.req(`/api/articles/${draft.article.id}/like`, { method: "POST" })).status).toBe(404);
  });
});

describe("follows", () => {
  it("follow / unfollow update counts, lists and flags", async () => {
    const star = await onboardedUser(app);
    const f1 = await onboardedUser(app);
    const f2 = await onboardedUser(app);
    const follow = (c: Client, username: string, method: "POST" | "DELETE" = "POST") =>
      c.req(`/api/users/${username}/follow`, { method }).then((r) => json(r));

    expect(await follow(f1, star.username)).toEqual({ following: true, followerCount: 1 });
    expect(await follow(f1, star.username)).toEqual({ following: true, followerCount: 1 });
    expect(await follow(f2, star.username.toUpperCase())).toEqual({ following: true, followerCount: 2 });
    expect(await follow(star, f1.username)).toEqual({ following: true, followerCount: 1 });

    const profile = await json<ProfileData>(await f1.req(`/api/users/${star.username}`));
    expect(profile.user).toMatchObject({ id: star.userId, username: star.username, name: "Test Publisher", bio: "Reporting from the test suite." });
    expect(profile.counts).toEqual({ articles: 0, followers: 2, following: 1 });
    expect(profile.viewer).toEqual({ isSelf: false, follows: true });
    expect((await json<ProfileData>(await star.req(`/api/users/${star.username}`))).viewer).toEqual({ isSelf: true, follows: false });
    expect((await json<ProfileData>(await app.request(`/api/users/${star.username}`))).viewer).toEqual({ isSelf: false, follows: false });

    const followers = await json<Page<UserRow>>(await f1.req(`/api/users/${star.username}/followers`));
    expect(followers.items.map((u) => u.username)).toEqual([f2.username, f1.username]);
    expect(followers.items.find((u) => u.username === f1.username)).toMatchObject({ isViewer: true, viewerFollows: false });
    const firstPage = await json<Page<UserRow>>(await app.request(`/api/users/${star.username}/followers?limit=1`));
    expect(firstPage.items).toHaveLength(1);
    const secondPage = await json<Page<UserRow>>(await app.request(`/api/users/${star.username}/followers?limit=1&cursor=${firstPage.nextCursor}`));
    expect(secondPage.items.map((u) => u.username)).toEqual([f1.username]);
    expect(secondPage.nextCursor).toBeNull();

    const following = await json<Page<UserRow>>(await star.req(`/api/users/${star.username}/following`));
    expect(following.items).toEqual([expect.objectContaining({ username: f1.username, viewerFollows: true, isViewer: false })]);

    expect(await follow(f1, star.username, "DELETE")).toEqual({ following: false, followerCount: 1 });
    expect(await follow(f1, star.username, "DELETE")).toEqual({ following: false, followerCount: 1 });
    expect((await json<ProfileData>(await app.request(`/api/users/${star.username}`))).counts.followers).toBe(1);
  });

  it("rejects following yourself and unknown users", async () => {
    const me = await onboardedUser(app);
    const res = await me.req(`/api/users/${me.username}/follow`, { method: "POST" });
    expect(res.status).toBe(400);
    expect((await json<ApiErrorBody>(res)).error.code).toBe("cannot_follow_self");
    expect((await me.req(`/api/users/nobody.${randomLetters(10)}/follow`, { method: "POST" })).status).toBe(404);
    expect((await client(app).req(`/api/users/${me.username}/follow`, { method: "POST" })).status).toBe(401);
  });

  it("profiles 404 for unknown or not-yet-onboarded users", async () => {
    expect((await app.request(`/api/users/ghost.${randomLetters(10)}`)).status).toBe(404);
    expect((await app.request("/api/users/Bad_Name")).status).toBe(404);
    const half = await signUp(app);
    const me = await json<{ viewer: { username: string | null } }>(await half.req("/api/me"));
    expect(me.viewer.username).toBeNull();
    expect((await app.request(`/api/users/${half.userId}`)).status).toBe(404);
  });
});

describe("views", () => {
  it("counts unique views per viewer; anon viewers get an httpOnly wn_vid cookie; authors don't count", async () => {
    const author = await reporterUser(app);
    const article = await publishArticle(author);

    const anon = client(app);
    const first = await anon.req("/api/views", { json: { ids: [article.id] } });
    expect(await json(first)).toEqual({ counted: [article.id] });
    const cookie = first.headers.getSetCookie().find((c) => c.startsWith("wn_vid="));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=31536000/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(anon.cookie).toContain("wn_vid=");

    expect(await json(await anon.req("/api/views", { json: { ids: [article.id, article.id] } }))).toEqual({ counted: [] });
    expect(await json(await client(app).req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [article.id] });

    const reader = await onboardedUser(app);
    expect(await json(await reader.req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [article.id] });
    expect(await json(await reader.req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [] });

    expect(await json(await author.req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [] });
    expect(await json(await client(app).req("/api/views", { json: { ids: [crypto.randomUUID()] } }))).toEqual({ counted: [] });

    expect((await detail(article.slug)).viewCount).toBe(3);
  });

  it("only trusts viewer ids the server signed: a made-up wn_vid is replaced, and new ids per IP are limited", async () => {
    const author = await reporterUser(app);
    const article = await publishArticle(author);
    const forged = crypto.randomUUID();
    const faker = client(app, `wn_vid=${forged}`);
    expect(await json(await faker.req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [article.id] });
    expect(faker.cookie).not.toContain(forged); // a signed id was issued instead
    expect(verifyViewerId(decodeURIComponent(faker.cookie.replace(/^.*wn_vid=([^;]+).*$/, "$1")))).toMatch(/^[0-9a-f-]{36}$/);
    const keys = await db.select({ key: articleView.viewerKey }).from(articleView).where(eq(articleView.articleId, article.id));
    expect(keys.map((k) => k.key)).not.toContain(`a:${forged}`);
    // Re-using the signed id doesn't count again; tampering with it gets treated as a new visitor.
    expect(await json(await faker.req("/api/views", { json: { ids: [article.id] } }))).toEqual({ counted: [] });

    // One address throwing its cookie away every time: once its budget of new anonymous ids (and of anonymous
    // requests) is spent, nothing more is counted — the request is either refused (429) or counts nothing.
    const ip = nextIp();
    const results: number[] = [];
    for (let i = 0; i < RATE_LIMITS.viewerMint.limit + 3; i++) {
      const res = await client(app, "", ip).req("/api/views", { json: { ids: [article.id] } });
      results.push(res.status === 200 ? (await json<{ counted: string[] }>(res)).counted.length : -res.status);
    }
    const counted = results.filter((n) => n === 1).length;
    expect(counted).toBeLessThanOrEqual(RATE_LIMITS.viewerMint.limit);
    expect(counted).toBeGreaterThanOrEqual(Math.min(RATE_LIMITS.viewerMint.limit, RATE_LIMITS.views.limit * ANON_IP_FACTOR));
    expect(results.slice(-3).every((n) => n === 0 || n === -429)).toBe(true);
  });

  it("validates ids", async () => {
    expect((await client(app).req("/api/views", { json: { ids: ["not-a-uuid"] } })).status).toBe(400);
    expect((await client(app).req("/api/views", { json: { ids: [] } })).status).toBe(400);
    expect((await client(app).req("/api/views", { json: { ids: Array.from({ length: 51 }, () => crypto.randomUUID()) } })).status).toBe(400);
  });
});

describe("shares, profile counts and top publishers", () => {
  it("counts shares from anyone, once per viewer per story per day", async () => {
    const author = await reporterUser(app);
    const article = await publishArticle(author);
    const anon = client(app);
    expect(await json(await anon.req(`/api/articles/${article.id}/share`, { json: { channel: "copy" } }))).toEqual({ shareCount: 1 });
    expect(await json(await anon.req(`/api/articles/${article.id}/share`, { json: { channel: "whatsapp" } }))).toEqual({ shareCount: 1 });
    expect(await json(await author.req(`/api/articles/${article.id}/share`, { json: { channel: "whatsapp" } }))).toEqual({ shareCount: 2 });
    expect(await json(await author.req(`/api/articles/${article.id}/share`, { json: { channel: "x" } }))).toEqual({ shareCount: 2 });
    expect((await client(app).req(`/api/articles/${article.id}/share`, { json: { channel: "carrier-pigeon" } })).status).toBe(400);
    expect((await client(app).req(`/api/articles/${crypto.randomUUID()}/share`, { json: { channel: "x" } })).status).toBe(404);
    expect((await detail(article.slug)).shareCount).toBe(2);
  });

  it("reports profile article counts and lists publishers to follow", async () => {
    const big = await reporterUser(app);
    const small = await reporterUser(app);
    const lurker = await onboardedUser(app); // no articles → not a publisher
    const fan = await onboardedUser(app);
    await publishArticle(big, `Big paper runs its first big story ${randomLetters(4)}`);
    await publishArticle(big, `Big paper runs its second big story ${randomLetters(4)}`);
    await publishArticle(small, `Small paper runs a small story today ${randomLetters(4)}`);
    await small.req("/api/articles", { json: { title: "Unpublished", action: "draft" } });
    await fan.req(`/api/users/${big.username}/follow`, { method: "POST" });

    expect((await json<ProfileData>(await app.request(`/api/users/${big.username}`))).counts).toEqual({ articles: 2, followers: 1, following: 0 });
    expect((await json<ProfileData>(await app.request(`/api/users/${small.username}`))).counts).toEqual({ articles: 1, followers: 0, following: 0 });
    expect((await json<ProfileData>(await app.request(`/api/users/${fan.username}`))).counts).toEqual({ articles: 0, followers: 0, following: 1 });

    const limit = 20;
    const top = await json<{ items: UserRow[] }>(await fan.req(`/api/users/top?limit=${limit}`));
    const names = top.items.map((u) => u.username);
    expect(names).not.toContain(lurker.username);
    expect(names).not.toContain(fan.username); // the viewer is never suggested
    for (const row of top.items) expect(row.username).toMatch(/^[a-z.]+$/);
    // With fewer rows than the limit every publisher is listed, so both must be there, ranked by followers.
    if (top.items.length < limit) {
      expect(names).toContain(big.username);
      expect(names).toContain(small.username);
    }
    if (names.includes(big.username) && names.includes(small.username)) {
      expect(names.indexOf(big.username)).toBeLessThan(names.indexOf(small.username));
    }
    const bigRow = top.items.find((u) => u.username === big.username);
    if (bigRow) expect(bigRow).toMatchObject({ viewerFollows: true, isViewer: false, id: big.userId });

    const grid = await json<Page<ArticleCard>>(await app.request(`/api/users/${big.username}/articles`));
    expect(grid.items).toHaveLength(2);
    expect(grid.items.every((i) => i.author.username === big.username)).toBe(true);
  });
});
