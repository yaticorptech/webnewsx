import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import {
  REPORT_RULES,
  type AdminFlagGroup,
  type ArticleDetail,
  type NotificationsResponse,
  type Page,
  type ReportedStoriesResponse,
  type UserNotice,
} from "../../src/shared/contracts.js";
import { adminUser, cleanupFixtures, client, freshApp, json, onboardedUser, publishArticle, reporterUser, type Client } from "../helpers.js";

/*
 * Report rules (REPORT_RULES, owner 2026-09-30): every report warns the author (the bell + a warning banner, never who
 * reported); from `reviewAt` open reports the story waits for the Editor Desk's decision; nothing is hidden
 * automatically; the reader who reported it sees that on the story.
 */

const app = freshApp();
const { reviewAt } = REPORT_RULES;

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const report = (reader: Client, id: string, reason = "misinformation", note?: string) =>
  reader.req(`/api/articles/${id}/flag`, { json: { reason, note } });

async function detailAs(c: Client, slug: string): Promise<ArticleDetail | null> {
  const res = await c.req(`/api/articles/by-slug/${slug}`);
  if (res.status === 404) return null;
  expect(res.status).toBe(200);
  return (await json<{ article: ArticleDetail }>(res)).article;
}

async function notices(author: Client): Promise<UserNotice[]> {
  return (await json<{ items: UserNotice[] }>(await author.req("/api/me/notices"))).items;
}

const bell = async (c: Client) => json<NotificationsResponse>(await c.req("/api/me/notifications?limit=50"));

describe("report rules", () => {
  it("warns the author on every report, sends it to the desk from reviewAt reports, never hides it by itself", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const readers = await Promise.all(Array.from({ length: 7 }, () => onboardedUser(app)));
    const story = await publishArticle(author, "A story many readers report");

    // Every report: the bell (reason + note, never who) and a warning banner.
    expect((await report(readers[0]!, story.id, "misinformation", "The dates are wrong")).status).toBe(201);
    const first = await bell(author);
    expect(first.items[0]).toMatchObject({ type: "story_reported", reason: "misinformation", note: "The dates are wrong", actor: null });
    const warned = await notices(author);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ kind: "warning", automatic: true, story: { id: story.id } });
    expect(warned[0]?.message).toContain("misinformation");
    expect(warned[0]?.message).toContain("The dates are wrong");

    // One report: listed for the desk, not yet "needs decision".
    const queue = async () =>
      (await json<Page<AdminFlagGroup>>(await desk.req("/api/admin/flags?status=open&limit=50"))).items.find((g) => g.article.id === story.id);
    expect(await queue()).toMatchObject({ openCount: 1, needsDecision: reviewAt <= 1 });

    for (const reader of readers.slice(1, reviewAt)) expect((await report(reader, story.id, "spam")).status).toBe(201);
    expect(await queue()).toMatchObject({ openCount: reviewAt, needsDecision: true });

    // Many more reports: still public — the desk decides.
    for (const reader of readers.slice(reviewAt)) expect((await report(reader, story.id)).status).toBe(201);
    expect(await detailAs(client(app), story.slug)).not.toBeNull();
    expect(await notices(author)).toHaveLength(readers.length);

    // The reader who reported it sees their report on the story; others don't.
    expect((await detailAs(readers[1]!, story.slug))?.viewer.reported).toBe("spam");
    expect((await detailAs(await onboardedUser(app), story.slug))?.viewer.reported).toBeNull();

    // The desk dismisses: the reports are closed, the mark goes.
    expect((await desk.req(`/api/admin/flags/${story.id}/resolve`, { json: { action: "dismiss" } })).status).toBe(200);
    expect((await detailAs(readers[1]!, story.slug))?.viewer.reported).toBeNull();

    const reported = await json<ReportedStoriesResponse>(await author.req("/api/me/reported-stories"));
    expect(reported.items[0]).toMatchObject({ id: story.id, hidden: false, locked: false, reports: readers.length });
  });
});

describe("the bell: new followers and new stories from followed publishers", () => {
  it("tells followers once per story, and only them", async () => {
    const publisher = await reporterUser(app);
    const fan = await onboardedUser(app);
    const stranger = await onboardedUser(app);
    expect((await fan.req(`/api/users/${publisher.username}/follow`, { method: "POST" })).status).toBe(200);

    const story = await publishArticle(publisher, "Harbour festival returns this weekend");
    const got = await bell(fan);
    expect(got.unread).toBe(1);
    expect(got.items[0]).toMatchObject({
      type: "new_story",
      actor: { username: publisher.username },
      story: { id: story.id, slug: story.slug, title: story.title },
      read: false,
    });
    expect((await bell(stranger)).items).toEqual([]);

    // The publisher heard about the new follower — once, even after an unfollow and a follow again.
    await fan.req(`/api/users/${publisher.username}/follow`, { method: "DELETE" });
    await fan.req(`/api/users/${publisher.username}/follow`, { method: "POST" });
    const theirs = await bell(publisher);
    expect(theirs.items).toHaveLength(1);
    expect(theirs.items[0]).toMatchObject({ type: "new_follower", actor: { username: fan.username }, story: null, read: false });

    // The viewer carries the unread count for the badge.
    const me = await json<{ viewer: { unreadNotifications: number } }>(await fan.req("/api/me"));
    expect(me.viewer.unreadNotifications).toBe(1);
  });
});

describe("the bell: likes and comments on your article, grouped like Instagram", () => {
  it("keeps one unread group per article and kind, counts what's still there, and starts over once seen", async () => {
    const author = await reporterUser(app);
    const fans = await Promise.all([0, 1, 2].map(() => onboardedUser(app)));
    const story = await publishArticle(author, "Monsoon arrives early on the coast");
    const like = (c: Client, method = "POST") => c.req(`/api/articles/${story.id}/like`, { method });

    for (const fan of fans) expect((await like(fan)).status).toBe(200);
    expect((await like(client(app))).status).toBe(200); // a logged-out visitor
    expect((await like(author)).status).toBe(200); // the author's own like never counts

    let got = await bell(author);
    const likes = got.items.filter((item) => item.type === "story_liked");
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({ count: 4, actor: { username: fans[2]!.username }, story: { id: story.id } });

    // Taken back → not counted.
    await like(fans[0]!, "DELETE");
    expect((await bell(author)).items.find((item) => item.type === "story_liked")?.count).toBe(3);

    await fans[0]!.req(`/api/articles/${story.id}/comments`, { json: { body: "Great reporting" } });
    await fans[1]!.req(`/api/articles/${story.id}/comments`, { json: { body: "Thanks for this update" } });
    got = await bell(author);
    expect(got.items.find((item) => item.type === "story_commented")).toMatchObject({
      count: 2,
      note: "Thanks for this update",
      actor: { username: fans[1]!.username },
    });
    expect(got.unread).toBe(2);

    // Seen → the next like starts a new group at the top.
    await author.req("/api/me/notifications/read", { json: {} });
    expect((await like(fans[0]!)).status).toBe(200);
    got = await bell(author);
    expect(got.items.filter((item) => item.type === "story_liked")).toHaveLength(2);
    expect(got.items[0]).toMatchObject({ type: "story_liked", count: 1, read: false, actor: { username: fans[0]!.username } });
  });
});
