import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { article as articleTable } from "../../src/db/schema.js";
import type {
  AdminStoryRow,
  ApiErrorBody,
  ArticleCard,
  ArticleComment,
  ArticleDetail,
  DraftCard,
  Headline,
  OwnedArticle,
  Page,
  SaveArticleResponse,
  ShortLinkTarget,
} from "../../src/shared/contracts.js";
import {
  LONG_BODY,
  adminUser,
  cleanupFixtures,
  client,
  coverOf,
  freshApp,
  json,
  onboardedUser,
  publishArticle,
  randomLetters,
  reporterUser,
  type Client, PUBLISH_EXTRAS } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);

describe("drafts", () => {
  it("saves a partial draft, updates it, and keeps it private", async () => {
    const author = await reporterUser(app);
    const created = await author.req("/api/articles", { json: { title: "Half an idea", action: "draft" } });
    expect(created.status).toBe(201);
    const first = await json<SaveArticleResponse>(created);
    if (first.status !== "draft") throw new Error("expected draft");
    expect(first.article).toMatchObject({ title: "Half an idea", bodyHtml: null, cover: null, linkUrl: null, status: "draft", slug: null });

    const cover = await coverOf(author);
    const updated = await author.req("/api/articles", {
      json: { id: first.article.id, title: "A whole idea", bodyHtml: "<p>Some text</p>", cover, action: "draft" },
    });
    expect(updated.status).toBe(200);
    const second = await json<SaveArticleResponse>(updated);
    if (second.status !== "draft") throw new Error("expected draft");
    expect(second.article.id).toBe(first.article.id);
    expect(second.article.cover).toEqual({ url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl });

    const owned = await author.req(`/api/articles/${first.article.id}`);
    expect(owned.status).toBe(200);
    expect((await json<{ article: OwnedArticle }>(owned)).article).toMatchObject({ status: "draft", slug: null, title: "A whole idea", bodyHtml: "<p>Some text</p>" });

    // Drafts listing: owner only.
    const drafts = await json<Page<DraftCard>>(await author.req(`/api/users/${author.username}/drafts`));
    expect(ids(drafts.items)).toEqual([first.article.id]);
    expect(drafts.items[0]).toMatchObject({ title: "A whole idea", excerpt: "Some text", coverUrl: cover.url });
    expect((await json<Page<DraftCard>>(await author.req(`/api/users/${author.username}/articles?status=draft`))).items).toHaveLength(1);

    const stranger = await reporterUser(app);
    expect((await stranger.req(`/api/articles/${first.article.id}`)).status).toBe(404);
    expect((await stranger.req(`/api/users/${author.username}/drafts`)).status).toBe(404);
    expect((await stranger.req(`/api/users/${author.username}/articles?status=draft`)).status).toBe(404);
    expect((await app.request(`/api/users/${author.username}/drafts`)).status).toBe(404);
    expect((await stranger.req("/api/articles", { json: { id: first.article.id, title: "hijack", action: "draft" } })).status).toBe(404);
    expect((await stranger.req(`/api/articles/${first.article.id}`, { method: "DELETE" })).status).toBe(404);

    // Drafts never show up publicly.
    expect((await json<Page<ArticleCard>>(await app.request(`/api/users/${author.username}/articles`))).items).toHaveLength(0);
    const feed = await json<Page<ArticleCard>>(await app.request("/api/feed?limit=30"));
    expect(ids(feed.items)).not.toContain(first.article.id);
  });

  it("needs at least a title, image or text", async () => {
    const author = await reporterUser(app);
    const res = await author.req("/api/articles", { json: { title: "  ", bodyHtml: "<p></p>", action: "draft" } });
    expect(res.status).toBe(400);
    expect((await json<ApiErrorBody>(res)).error.code).toBe("validation_error");
  });

  it("rejects covers that belong to someone else", async () => {
    const other = await reporterUser(app);
    const cover = await coverOf(other);
    const author = await reporterUser(app);
    const res = await author.req("/api/articles", { json: { title: "Stolen", cover, action: "draft" } });
    expect(res.status).toBe(400);
    expect((await json<ApiErrorBody>(res)).error.fields?.cover).toBeTruthy();
  });
});

describe("publish", () => {
  it("reports every missing field", async () => {
    const author = await reporterUser(app);
    const res = await author.req("/api/articles", { json: { title: "", bodyHtml: "<p>too short</p>", ...PUBLISH_EXTRAS, action: "publish" } });
    expect(res.status).toBe(400);
    const { error } = await json<ApiErrorBody>(res);
    expect(error.code).toBe("validation_error");
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(["articleImage", "bodyHtml", "category", "cover", "title"]);
    expect(error.fields?.category).toBe("Choose a category");
  });

  it("counts text (not markup) for the 30-char minimum", async () => {
    const author = await reporterUser(app);
    const cover = await coverOf(author);
    const res = await author.req("/api/articles", {
      json: { title: "Markup only", bodyHtml: `<p><strong>${"&nbsp;".repeat(40)}</strong></p><p>short</p>`, cover, articleImage: cover, category: "others", ...PUBLISH_EXTRAS, action: "publish" },
    });
    expect(res.status).toBe(400);
    expect(Object.keys((await json<ApiErrorBody>(res)).error.fields ?? {})).toEqual(["bodyHtml"]);
  });

  it("validates linkUrl (http/https only) and title length", async () => {
    const author = await reporterUser(app);
    const bad = await author.req("/api/articles", { json: { title: "x", linkUrl: "javascript:alert(1)", action: "draft" } });
    expect(bad.status).toBe(400);
    expect((await json<ApiErrorBody>(bad)).error.fields?.linkUrl).toBeTruthy();
    const long = await author.req("/api/articles", { json: { title: "x".repeat(151), action: "draft" } });
    expect(long.status).toBe(400);
    expect((await json<ApiErrorBody>(long)).error.fields?.title).toBeTruthy();
    const badAction = await author.req("/api/articles", { json: { title: "x", action: "schedule" } });
    expect(badAction.status).toBe(400);
  });

  it("publishes with slug, excerpt, reading time, domain and sanitized body", async () => {
    const author = await reporterUser(app);
    const cover = await coverOf(author);
    const res = await author.req("/api/articles", {
      json: {
        title: "Council approves the new riverside tram line",
        bodyHtml: `${LONG_BODY}<script>alert(1)</script><p onclick="x()"><a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a></p>`,
        cover,
        articleImage: cover,
        linkUrl: "https://www.Example.com/transit",
        category: "karnataka",
        district: "Mysuru",
        ...PUBLISH_EXTRAS, action: "publish",
      },
    });
    expect(res.status).toBe(201);
    const body = await json<SaveArticleResponse>(res);
    if (body.status !== "published") throw new Error("expected published");
    const article = body.article;
    expect(article.status).toBe("published");
    expect(article.slug).toMatch(/^council-approves-the-new-riverside-tram-line-[a-z0-9]{6}$/);
    expect(article.linkDomain).toBe("example.com");
    expect(article).toMatchObject({ category: "karnataka", district: "Mysuru" });
    expect(article.linkUrl).toBe("https://www.Example.com/transit");
    expect(article.readingMinutes).toBe(1);
    // Cards show the blurb as their text (owner 2026-10-15).
    expect(article.excerpt).toBe(PUBLISH_EXTRAS.blurb);
    expect(article.bodyHtml).not.toMatch(/script|onclick|javascript/);
    expect(article.bodyHtml).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(article.bodyHtml).toContain('target="_blank"');
    expect(article.viewer).toEqual({ liked: false, followingAuthor: false, isAuthor: true, saved: false, reported: null });
    expect(article.author).toMatchObject({ id: author.userId, username: author.username, bio: "Reporting from the test suite." });
    expect(article).toMatchObject({ coverUrl: cover.url, coverWidth: cover.width, coverHeight: cover.height, viewCount: 0, likeCount: 0, shareCount: 0 });
    expect(Date.now() - new Date(article.publishedAt).getTime()).toBeLessThan(60_000);
  });

  it("publishes an existing draft by id, then refuses to edit it (409)", async () => {
    const author = await reporterUser(app);
    const draft = await json<SaveArticleResponse>(await author.req("/api/articles", { json: { title: "Soon", action: "draft" } }));
    const cover = await coverOf(author);
    const published = await author.req("/api/articles", {
      json: { id: draft.article.id, title: "Now live", bodyHtml: LONG_BODY, cover, articleImage: cover, category: "sports", ...PUBLISH_EXTRAS, action: "publish" },
    });
    expect(published.status).toBe(200);
    const body = await json<SaveArticleResponse>(published);
    expect(body.status).toBe("published");
    expect(body.article.id).toBe(draft.article.id);

    const edit = await author.req("/api/articles", { json: { id: draft.article.id, title: "Edited", action: "draft" } });
    expect(edit.status).toBe(409);
    expect((await json<ApiErrorBody>(edit)).error.code).toBe("already_published");
    expect((await json<Page<DraftCard>>(await author.req(`/api/users/${author.username}/drafts`))).items).toHaveLength(0);

    const owned = await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${draft.article.id}`));
    expect(owned.article).toMatchObject({ status: "published", slug: body.article.slug });
  });
});

describe("categories", () => {
  it("needs a category to publish, and a district from the list for Karnataka", async () => {
    const author = await reporterUser(app);
    const cover = await coverOf(author);
    const publish = (extra: Record<string, unknown>) =>
      author.req("/api/articles", { json: { title: "Ward budget passed", bodyHtml: LONG_BODY, cover, articleImage: cover, ...PUBLISH_EXTRAS, action: "publish", ...extra } });
    const fieldsOf = async (res: Response) => {
      expect(res.status).toBe(400);
      return (await json<ApiErrorBody>(res)).error.fields ?? {};
    };
    expect(await fieldsOf(await publish({ category: "gossip" }))).toMatchObject({ category: "Choose a category" });
    expect(await fieldsOf(await publish({ category: "karnataka" }))).toEqual({ district: "Choose the district" });
    expect(await fieldsOf(await publish({ category: "karnataka", district: "Atlantis" }))).toEqual({ district: "Choose a district from the list" });

    // A district only sticks to Karnataka stories.
    const sports = await publish({ category: "sports", district: "Mysuru" });
    expect(sports.status).toBe(201);
    expect((await json<{ article: ArticleDetail }>(sports)).article).toMatchObject({ category: "sports", district: null });

    // Drafts keep their category (and a valid district) for the composer.
    const draft = await json<SaveArticleResponse>(
      await author.req("/api/articles", { json: { title: "Later", category: "karnataka", district: "Udupi", action: "draft" } }),
    );
    const owned = await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${draft.article.id}`));
    expect(owned.article).toMatchObject({ category: "karnataka", district: "Udupi" });
  });

  it("serves category and district feeds, newest first", async () => {
    const author = await reporterUser(app);
    const sports = await publishArticle(author, `Kabaddi final goes to a raid-off ${randomLetters(5)}`, "sports");
    const cover = await coverOf(author);
    const res = await author.req("/api/articles", {
      json: { title: `Mysuru Dasara lights switch on ${randomLetters(5)}`, bodyHtml: LONG_BODY, cover, articleImage: cover, category: "karnataka", district: "Mysuru", ...PUBLISH_EXTRAS, action: "publish" },
    });
    const mysuru = (await json<{ article: ArticleDetail }>(res)).article;
    const feed = async (query: string) => ids((await json<Page<ArticleCard>>(await app.request(`/api/feed?${query}`))).items);

    const sportsFeed = await feed("category=sports&limit=30");
    expect(sportsFeed).toContain(sports.id);
    expect(sportsFeed).not.toContain(mysuru.id);
    expect(await feed("category=karnataka&limit=30")).toContain(mysuru.id);
    expect(await feed("category=karnataka&district=Mysuru&limit=30")).toContain(mysuru.id);
    expect(await feed("category=karnataka&district=Udupi&limit=30")).not.toContain(mysuru.id);
    const card = (await json<Page<ArticleCard>>(await app.request("/api/feed?category=karnataka&district=Mysuru&limit=30"))).items.find((i) => i.id === mysuru.id);
    expect(card).toMatchObject({ category: "karnataka", district: "Mysuru" });
    // Home (the ranked mix) carries the category too.
    const home = await json<Page<ArticleCard>>(await author.req("/api/feed?tab=foryou&limit=30"));
    expect(home.items.find((i) => i.id === mysuru.id)).toMatchObject({ category: "karnataka", district: "Mysuru" });

    expect((await app.request("/api/feed?category=gossip")).status).toBe(400);
    expect((await app.request("/api/feed?category=sports&district=Mysuru")).status).toBe(400);
    expect((await app.request("/api/feed?category=karnataka&district=Atlantis")).status).toBe(400);
  });

  it("lets the author (or the Editor Desk, audited) move a story to another category", async () => {
    const author = await reporterUser(app);
    const story = await publishArticle(author, `Tram depot plans shelved ${randomLetters(5)}`, "others");
    const move = (c: Client, body: Record<string, unknown>) => c.req(`/api/articles/${story.id}/category`, { method: "PATCH", json: body });

    expect((await move(author, { category: "karnataka" })).status).toBe(400);
    const moved = await move(author, { category: "karnataka", district: "Udupi" });
    expect(moved.status, await moved.clone().text()).toBe(200);
    expect(await json(moved)).toEqual({ id: story.id, category: "karnataka", district: "Udupi" });
    expect(ids((await json<Page<ArticleCard>>(await app.request("/api/feed?category=karnataka&district=Udupi&limit=30"))).items)).toContain(story.id);

    const stranger = await reporterUser(app);
    expect((await move(stranger, { category: "sports" })).status).toBe(404);
    expect((await move(client(app), { category: "sports" })).status).toBe(401);

    const desk = await adminUser(app);
    expect(await json(await move(desk, { category: "politics", district: "Udupi" }))).toEqual({ id: story.id, category: "politics", district: null });
    const audit = await json<Page<{ action: string; meta: Record<string, unknown> | null }>>(await desk.req(`/api/admin/audit?target=${story.id}`));
    expect(audit.items[0]).toMatchObject({ action: "story.category", meta: { from: "karnataka", to: "politics" } });
    const filtered = await json<Page<{ id: string }>>(await desk.req(`/api/admin/stories?status=published&category=politics&reporter=${author.username}`));
    expect(ids(filtered.items)).toEqual([story.id]);
  });
});

describe("poster templates", () => {
  it("stores the reporter's pick (Classic when none) and serves it on the detail and every feed card", async () => {
    const author = await reporterUser(app);
    const publish = async (extra: Record<string, unknown>) =>
      author.req("/api/articles", {
        json: { title: `Ferry timetable changes ${randomLetters(5)}`, bodyHtml: LONG_BODY, cover: await coverOf(author), articleImage: await coverOf(author), category: "national", ...PUBLISH_EXTRAS, action: "publish", ...extra },
      });

    const unknown = await publish({ template: "polaroid" });
    expect(unknown.status).toBe(400);
    expect((await json<ApiErrorBody>(unknown)).error.fields).toMatchObject({ template: "Choose a template" });

    const slantRes = await publish({ template: "slant" });
    expect(slantRes.status, await slantRes.clone().text()).toBe(201);
    const slant = (await json<{ article: ArticleDetail }>(slantRes)).article;
    expect(slant.template).toBe("slant");
    const plain = (await json<{ article: ArticleDetail }>(await publish({}))).article;
    expect(plain.template).toBe("classic");

    expect((await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${slant.slug}`))).article.template).toBe("slant");
    for (const tab of ["latest", "foryou"]) {
      const feed = await json<Page<ArticleCard>>(await author.req(`/api/feed?tab=${tab}&limit=30`));
      expect(feed.items.find((i) => i.id === slant.id)?.template, tab).toBe("slant");
      expect(feed.items.find((i) => i.id === plain.id)?.template, tab).toBe("classic");
    }

    // A draft keeps the pick (or none yet) for the composer.
    const draft = await json<SaveArticleResponse>(await author.req("/api/articles", { json: { title: "Later", template: "red-band", action: "draft" } }));
    expect(draft.article.template).toBe("red-band");
    expect((await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${draft.article.id}`))).article.template).toBe("red-band");
    const bare = await json<SaveArticleResponse>(await author.req("/api/articles", { json: { title: "No design yet", action: "draft" } }));
    expect((await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${bare.article.id}`))).article.template).toBeNull();
  });

  it("keeps a Trainee's pick through the Review Desk (Classic for stories sent before templates existed)", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const submit = async (extra: Record<string, unknown>) => {
      const res = await trainee.req("/api/articles", {
        json: { title: `Ward water tanker rota ${randomLetters(4)}`, bodyHtml: LONG_BODY, cover: await coverOf(trainee), articleImage: await coverOf(trainee), category: "education", ...PUBLISH_EXTRAS, action: "publish", ...extra },
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const body = await json<SaveArticleResponse>(res);
      if (body.status !== "in_review") throw new Error("expected the Review Desk");
      return body.article;
    };
    const approvedTemplate = async (id: string) => {
      const res = await desk.req(`/api/admin/review/${id}/approve`, { json: {} });
      expect(res.status, await res.clone().text()).toBe(200);
      const slug = (await json<{ story: AdminStoryRow }>(res)).story.slug;
      return (await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${slug}`))).article.template;
    };

    const picked = await submit({ template: "red-band" });
    expect(picked.template).toBe("red-band");
    expect(await approvedTemplate(picked.id)).toBe("red-band");
    expect((await submit({})).template).toBe("classic");

    const legacy = await submit({ template: "split" });
    await db.update(articleTable).set({ template: null }).where(eq(articleTable.id, legacy.id));
    expect(await approvedTemplate(legacy.id)).toBe("classic");
  });
});

describe("comments", () => {
  it("lets signed-in accounts comment, counts them, and limits who can delete", async () => {
    const author = await reporterUser(app);
    const story = await publishArticle(author, `Comment thread ${randomLetters(5)}`, "national");
    const reader = await onboardedUser(app);
    const stranger = await onboardedUser(app);
    const path = `/api/articles/${story.id}/comments`;

    expect((await client(app).req(path, { json: { body: "Hello" } })).status).toBe(401);
    expect((await reader.req(path, { json: { body: "   " } })).status).toBe(400);
    expect((await reader.req(path, { json: { body: "x".repeat(1001) } })).status).toBe(400);

    const first = await reader.req(path, { json: { body: "First!\nSecond line." } });
    expect(first.status).toBe(201);
    const { comment } = await json<{ comment: ArticleComment }>(first);
    expect(comment).toMatchObject({ body: "First!\nSecond line.", canDelete: true, author: { username: reader.username } });
    await reader.req(path, { json: { body: "Another one" } });

    const list = await json<Page<ArticleComment>>(await app.request(path));
    expect(list.items.map((c) => c.body)).toEqual(["Another one", "First!\nSecond line."]);
    expect(list.items.every((c) => !c.canDelete)).toBe(true);
    const card = (await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${story.slug}`))).article;
    expect(card.commentCount).toBe(2);

    const del = (c: Client, id: string) => c.req(`${path}/${id}`, { method: "DELETE" });
    expect((await del(stranger, comment.id)).status).toBe(404);
    expect((await del(author, comment.id)).status).toBe(200); // the story's author moderates their thread
    const [other] = (await json<Page<ArticleComment>>(await reader.req(path))).items;
    expect(other?.canDelete).toBe(true);
    expect((await del(reader, other!.id)).status).toBe(200);
    expect((await json<Page<ArticleComment>>(await app.request(path))).items).toEqual([]);
    expect((await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${story.slug}`))).article.commentCount).toBe(0);
    expect((await app.request(`/api/articles/${crypto.randomUUID()}/comments`)).status).toBe(404);
  });

  it("threads replies one level deep, likes comments and resolves @mentions", async () => {
    const author = await reporterUser(app);
    const story = await publishArticle(author, `Reply thread ${randomLetters(5)}`, "world");
    const reader = await onboardedUser(app);
    const path = `/api/articles/${story.id}/comments`;
    const post = async (c: Client, body: Record<string, unknown>) => {
      const res = await c.req(path, { json: body });
      expect(res.status, await res.clone().text()).toBe(201);
      return (await json<{ comment: ArticleComment }>(res)).comment;
    };

    const top = await post(reader, { body: `Great story @${author.username} — and hi @no.such.person.here!` });
    expect(top.mentions).toEqual([author.username]);
    const reply = await post(author, { body: `Thanks @${reader.username}`, parentId: top.id });
    expect(reply.parentId).toBe(top.id);
    // A reply to a reply joins the same thread.
    const nested = await post(reader, { body: "Replying to the reply", parentId: reply.id });
    expect(nested.parentId).toBe(top.id);
    expect((await reader.req(path, { json: { body: "x", parentId: crypto.randomUUID() } })).status).toBe(404);

    const list = await json<Page<ArticleComment>>(await app.request(path));
    expect(list.items.map((c) => c.id)).toEqual([top.id]);
    expect(list.items[0]).toMatchObject({ replyCount: 2, likeCount: 0, liked: false });
    const replies = await json<{ items: ArticleComment[] }>(await app.request(`${path}/${top.id}/replies`));
    expect(replies.items.map((c) => c.id)).toEqual([reply.id, nested.id]);

    // Likes (idempotent), and the viewer's own flag.
    const like = (method: "POST" | "DELETE") => reader.req(`${path}/${reply.id}/like`, { method });
    expect(await json(await like("POST"))).toEqual({ liked: true, likeCount: 1 });
    expect(await json(await like("POST"))).toEqual({ liked: true, likeCount: 1 });
    const mine = await json<{ items: ArticleComment[] }>(await reader.req(`${path}/${top.id}/replies`));
    expect(mine.items[0]).toMatchObject({ liked: true, likeCount: 1 });
    expect(await json(await like("DELETE"))).toEqual({ liked: false, likeCount: 0 });
    expect((await client(app).req(`${path}/${reply.id}/like`, { method: "POST" })).status).toBe(401);

    // Deleting the thread's top comment removes its replies and all three from the count.
    expect((await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${story.slug}`))).article.commentCount).toBe(3);
    expect((await reader.req(`${path}/${top.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${story.slug}`))).article.commentCount).toBe(0);
  });
});

describe("feed / by-slug / headlines", () => {
  it("serves latest and following feeds with viewer flags", async () => {
    const alice = await reporterUser(app);
    const bob = await reporterUser(app);
    const reader = await onboardedUser(app);
    const a1 = await publishArticle(alice, `Alice on the harbour ${randomLetters(4)}`);
    const b1 = await publishArticle(bob, `Bob on the city budget vote ${randomLetters(4)}`);

    // Other data may exist (demo content, real accounts): only relative order is asserted.
    const latest = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=latest&limit=30"));
    const order = ids(latest.items);
    expect(order).toContain(a1.id);
    expect(order).toContain(b1.id);
    expect(order.indexOf(b1.id)).toBeLessThan(order.indexOf(a1.id));
    const bobCard = latest.items.find((i) => i.id === b1.id);
    expect(bobCard).toMatchObject({ slug: b1.slug, title: b1.title, author: { username: bob.username }, viewer: { liked: false, followingAuthor: false, isAuthor: false } });
    for (let i = 1; i < latest.items.length; i++) {
      expect(new Date(latest.items[i - 1]!.publishedAt).getTime()).toBeGreaterThanOrEqual(new Date(latest.items[i]!.publishedAt).getTime());
    }

    // The reader follows nobody yet → empty following feed; then exactly Alice's story.
    expect((await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=following"))).items).toEqual([]);
    expect((await reader.req(`/api/users/${alice.username}/follow`, { method: "POST" })).status).toBe(200);
    const following = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=following"));
    expect(ids(following.items)).toEqual([a1.id]);
    expect(following.items[0]?.viewer).toEqual({ liked: false, followingAuthor: true, isAuthor: false, saved: false, reported: null });
    expect(following.nextCursor).toBeNull();

    expect((await app.request("/api/feed?tab=following")).status).toBe(401);
    expect((await app.request("/api/feed?tab=bogus")).status).toBe(400);
    expect((await app.request("/api/feed?cursor=garbage")).status).toBe(400);

    const headlines = await json<{ items: Headline[] }>(await app.request("/api/feed/headlines?limit=30"));
    expect(headlines.items.length).toBeLessThanOrEqual(30);
    expect(headlines.items.find((h) => h.id === b1.id)).toEqual({ id: b1.id, slug: b1.slug, title: b1.title, publishedAt: b1.publishedAt, author: { username: bob.username, reporterLevel: "verified" } });
    expect((await json<{ items: Headline[] }>(await app.request("/api/feed/headlines?limit=1"))).items).toHaveLength(1);
  });

  it("paginates with a stable cursor", async () => {
    const author = await reporterUser(app);
    const published: string[] = [];
    for (let i = 0; i < 5; i++) published.unshift((await publishArticle(author, `Story ${"abcde"[i]} of five ${randomLetters(4)}`)).id);

    // Author grid: deterministic (fresh author).
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/users/${author.username}/articles?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const page: Page<ArticleCard> = await json<Page<ArticleCard>>(await app.request(url));
      seen.push(...ids(page.items));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(published);

    // Global feed: consecutive pages never overlap and keep descending order.
    const first = await json<Page<ArticleCard>>(await app.request("/api/feed?limit=3"));
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await json<Page<ArticleCard>>(await app.request(`/api/feed?limit=3&cursor=${first.nextCursor}`));
    expect(ids(second.items).filter((id) => ids(first.items).includes(id))).toEqual([]);
    const last = first.items.at(-1)!;
    for (const item of second.items) expect(new Date(item.publishedAt).getTime()).toBeLessThanOrEqual(new Date(last.publishedAt).getTime());
  });

  it("returns article detail + more from the author by slug", async () => {
    const author = await reporterUser(app);
    const older = await publishArticle(author, `An older dispatch from the coast ${randomLetters(4)}`);
    const latest = await publishArticle(author, `The newest dispatch from the coast ${randomLetters(4)}`);
    const res = await app.request(`/api/articles/by-slug/${latest.slug}`);
    expect(res.status).toBe(200);
    const body = await json<{ article: ArticleDetail; moreFromAuthor: ArticleCard[] }>(res);
    expect(body.article.id).toBe(latest.id);
    expect(body.article.bodyHtml).toContain("<h2>What changes</h2>");
    expect(body.article.author).toMatchObject({ username: author.username, bio: "Reporting from the test suite." });
    expect(ids(body.moreFromAuthor)).toEqual([older.id]);
    expect((await app.request(`/api/articles/by-slug/${latest.slug.toUpperCase()}`)).status).toBe(200);
    expect((await app.request(`/api/articles/by-slug/does-not-exist-${randomLetters(6)}`)).status).toBe(404);
  });
});

describe("short links", () => {
  const resolve = (code: string) => app.request(`/api/articles/by-code/${code}`);

  it("gives a story a 7-char code when it goes live, resolves it in any case, and keeps it across a re-publish", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const story = await publishArticle(author, `Short link to the harbour story ${randomLetters(4)}`);
    const code = story.shortCode ?? "";
    expect(code).toMatch(/^[a-z0-9]{7}$/);

    const detail = await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${story.slug}`));
    expect(detail.article.shortCode).toBe(code);
    const latest = await json<Page<ArticleCard>>(await app.request("/api/feed?tab=latest&limit=30"));
    expect(latest.items.find((i) => i.id === story.id)?.shortCode).toBe(code);

    expect(await json<ShortLinkTarget>(await resolve(code))).toEqual({ slug: story.slug });
    expect(await json<ShortLinkTarget>(await resolve(code.toUpperCase()))).toEqual({ slug: story.slug });
    // Every story's code has 7 chars, so an 8-letter one is unknown; malformed codes are 404 without a lookup.
    const unknown = await resolve(randomLetters(8));
    expect(unknown.status).toBe(404);
    expect((await json<ApiErrorBody>(unknown)).error.code).toBe("not_found");
    expect((await resolve("ab")).status).toBe(404);
    expect((await resolve("not_a-code")).status).toBe(404);

    // Unpublished → the link leads nowhere; published again (new slug) → the same code leads to the new slug.
    expect((await desk.req(`/api/admin/stories/${story.id}/unpublish`, { json: { reason: "Needs a second source" } })).status).toBe(200);
    expect((await resolve(code)).status).toBe(404);
    const again = await author.req("/api/articles", {
      json: { id: story.id, title: story.title, bodyHtml: LONG_BODY, cover: await coverOf(author), articleImage: await coverOf(author), category: "national", ...PUBLISH_EXTRAS, action: "publish" },
    });
    expect(again.status, await again.clone().text()).toBe(200);
    const republished = await json<SaveArticleResponse>(again);
    if (republished.status !== "published") throw new Error("expected a published article");
    expect(republished.article.shortCode).toBe(code);
    expect(republished.article.slug).not.toBe(story.slug);
    expect(await json<ShortLinkTarget>(await resolve(code))).toEqual({ slug: republished.article.slug });
  });

  it("keeps a Trainee story's code dead while it waits at the Review Desk and live once the desk approves it", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const submit = async (id?: string) => {
      const res = await trainee.req("/api/articles", {
        json: { id, title: `A ward story for the Review Desk ${randomLetters(4)}`, bodyHtml: LONG_BODY, cover: await coverOf(trainee), articleImage: await coverOf(trainee), category: "education", ...PUBLISH_EXTRAS, action: "publish" },
      });
      expect(res.status, await res.clone().text()).toBe(id ? 200 : 201);
      const body = await json<SaveArticleResponse>(res);
      if (body.status !== "in_review") throw new Error("expected the Review Desk");
      return body.article.id;
    };
    const approve = async (id: string) => {
      const res = await desk.req(`/api/admin/review/${id}/approve`, { json: {} });
      expect(res.status, await res.clone().text()).toBe(200);
      return (await json<{ story: AdminStoryRow }>(res)).story.slug ?? "";
    };

    // Submitting hands out no code: a story gets one only when it goes live.
    const id = await submit();
    const [waiting] = await db.select({ shortCode: articleTable.shortCode }).from(articleTable).where(eq(articleTable.id, id));
    expect(waiting?.shortCode).toBeNull();

    const slug = await approve(id);
    const detail = await json<{ article: ArticleDetail }>(await app.request(`/api/articles/by-slug/${slug}`));
    const code = detail.article.shortCode ?? "";
    expect(code).toMatch(/^[a-z0-9]{7}$/);
    expect(await json<ShortLinkTarget>(await resolve(code))).toEqual({ slug });

    // Unpublished and sent back to the desk: it keeps its code, which leads nowhere until the desk approves it again.
    expect((await desk.req(`/api/admin/stories/${id}/unpublish`, { json: { reason: "Add the ward number" } })).status).toBe(200);
    expect(await submit(id)).toBe(id);
    expect((await resolve(code)).status).toBe(404);
    const newSlug = await approve(id);
    expect(newSlug).not.toBe(slug);
    expect(await json<ShortLinkTarget>(await resolve(code))).toEqual({ slug: newSlug });
  });
});

describe("delete", () => {
  it("lets only the owner delete", async () => {
    const author = await reporterUser(app);
    const other = await onboardedUser(app);
    const article = await publishArticle(author);
    expect((await other.req(`/api/articles/${article.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await client(app).req(`/api/articles/${article.id}`, { method: "DELETE" })).status).toBe(401);
    const res = await author.req(`/api/articles/${article.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await app.request(`/api/articles/by-slug/${article.slug}`)).status).toBe(404);
    expect((await app.request(article.coverUrl)).status).toBe(404); // cover file removed
    expect((await author.req("/api/articles/not-a-uuid", { method: "DELETE" })).status).toBe(404);
    expect((await author.req(`/api/articles/${article.id}`, { method: "DELETE" })).status).toBe(404);
  });
});
