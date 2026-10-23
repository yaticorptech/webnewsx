import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { articleRead, articleView } from "../../src/db/schema.js";
import type {
  ApiErrorBody,
  NewsroomBestTimes,
  NewsroomSeries,
  NewsroomStory,
  NewsroomSummary,
  Page,
} from "../../src/shared/contracts.js";
import { LONG_BODY, adminUser, cleanupFixtures, client, coverOf, freshApp, json, onboardedUser, publishArticle, reporterUser, PUBLISH_EXTRAS } from "../helpers.js";

/*
 * Newsroom analytics (SPEC §3.11) for this file's own reporters: every number below comes from events on
 * their own fixture stories, so the rest of the database doesn't matter.
 */
const app = freshApp();
const DAY = 86_400_000;

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const anonKey = () => `a:${crypto.randomUUID()}`;
const sum = (points: NewsroomSeries["points"], key: "views" | "reads" | "likes" | "shares" | "followers") =>
  points.reduce((total, p) => total + p[key], 0);

/** A past Wednesday 14:10 UTC, 7–13 days ago (inside the 90-day best-times window). */
function pastWednesdayAt1410Utc(): Date {
  const d = daysAgo(7);
  while (d.getUTCDay() !== 3) d.setTime(d.getTime() - DAY);
  d.setUTCHours(14, 10, 0, 0);
  return d;
}

describe("Newsroom", () => {
  it("KPIs with deltas, daily series, per-story table and best time to publish", async () => {
    const rep = await reporterUser(app);
    const reader = await onboardedUser(app);
    const a = await publishArticle(rep, "Newsroom story alpha: the night market returns");
    const b = await publishArticle(rep, "Newsroom story beta: new bus routes from Monday");

    // Views: 3 anonymous readers + the signed-in reader on A, the reader on B. The author's own view never counts.
    for (let i = 0; i < 3; i++) expect((await client(app).req("/api/views", { json: { ids: [a.id] } })).status).toBe(200);
    await reader.req("/api/views", { json: { ids: [a.id, b.id] } });
    expect(await json(await rep.req("/api/views", { json: { ids: [a.id] } }))).toEqual({ counted: [] });
    // Likes, shares, a read (article page open; the author's own read doesn't count) and a follow.
    await reader.req(`/api/articles/${a.id}/like`, { method: "POST" });
    await reader.req(`/api/articles/${a.id}/share`, { json: { channel: "copy" } });
    await client(app).req(`/api/articles/${b.id}/share`, { json: { channel: "whatsapp" } });
    expect(await json(await reader.req(`/api/articles/${a.id}/read`, { method: "POST" }))).toEqual({ counted: true });
    expect(await json(await reader.req(`/api/articles/${a.id}/read`, { method: "POST" }))).toEqual({ counted: false });
    expect(await json(await rep.req(`/api/articles/${a.id}/read`, { method: "POST" }))).toEqual({ counted: false });
    // Loading the page data (server render, link prefetch) is never a read.
    expect((await client(app).req(`/api/articles/by-slug/${a.slug}`)).status).toBe(200);
    expect((await reader.req(`/api/articles/by-slug/${b.slug}`)).status).toBe(200);
    expect((await client(app).req(`/api/articles/${crypto.randomUUID()}/read`, { method: "POST" })).status).toBe(404);
    expect((await db.select({ key: articleRead.viewerKey }).from(articleRead).where(inArray(articleRead.articleId, [a.id, b.id]))).map((r) => r.key)).toEqual([
      `u:${reader.userId}`,
    ]);
    await reader.req(`/api/users/${rep.username}/follow`, { method: "POST" });
    // Previous 7-day period: two older views on A (this fixture story only).
    await db.insert(articleView).values([
      { articleId: a.id, viewerKey: anonKey(), createdAt: daysAgo(10) },
      { articleId: a.id, viewerKey: anonKey(), createdAt: daysAgo(9) },
    ]);

    const week = await json<NewsroomSummary>(await rep.req("/api/newsroom/summary?range=7"));
    expect(week.range).toBe(7);
    expect(Date.parse(week.to) - Date.parse(week.from)).toBe(7 * DAY);
    expect(week.kpis).toEqual({
      views: { value: 5, previous: 2, delta: 1.5 },
      reads: { value: 1, previous: 0, delta: null },
      likes: { value: 1, previous: 0, delta: null },
      shares: { value: 2, previous: 0, delta: null },
      followers: { value: 1, previous: 0, delta: null },
    });
    // Lifetime totals come from the live counters (the backdated rows above never touched them).
    expect(week.totals).toEqual({ followers: 1, published: 2, inReview: 0, returned: 0, views: 5, likes: 1, shares: 2 });
    expect(week.pressPass).toMatchObject({ level: "verified", status: "active" });
    const month = await json<NewsroomSummary>(await rep.req("/api/newsroom/summary?range=30"));
    expect(month.kpis.views).toEqual({ value: 7, previous: 0, delta: null });

    const series = await json<NewsroomSeries>(await rep.req("/api/newsroom/series?range=7&tz=UTC"));
    expect(series).toMatchObject({ range: 7, timeZone: "UTC" });
    expect(series.points).toHaveLength(7);
    expect(series.points.at(-1)?.date).toBe(new Date().toISOString().slice(0, 10));
    expect(series.points.map((p) => p.date)).toEqual([...series.points.map((p) => p.date)].sort());
    expect({ views: sum(series.points, "views"), reads: sum(series.points, "reads"), likes: sum(series.points, "likes"), shares: sum(series.points, "shares") }).toEqual({
      views: 5,
      reads: 1,
      likes: 1,
      shares: 2,
    });
    expect(sum(series.points, "followers")).toBe(1);
    expect(series.points.at(-1)?.followersTotal).toBe(1);
    const longSeries = await json<NewsroomSeries>(await rep.req("/api/newsroom/series?range=30&tz=Not/AZone"));
    expect(longSeries.points).toHaveLength(30);
    expect(longSeries.timeZone).toBe("Asia/Kolkata");
    expect(sum(longSeries.points, "views")).toBe(7);

    const stories = await json<Page<NewsroomStory>>(await rep.req("/api/newsroom/stories"));
    expect(stories.items.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(stories.items[1]).toMatchObject({ status: "published", viewCount: 4, readCount: 1, likeCount: 1, shareCount: 1, engagementRate: 0.5, spotlight: null });
    expect(stories.items[0]).toMatchObject({ viewCount: 1, readCount: 0, shareCount: 1, engagementRate: 1 });
    const paged = await json<Page<NewsroomStory>>(await rep.req("/api/newsroom/stories?limit=1"));
    expect(paged.items.map((s) => s.id)).toEqual([b.id]);
    const next = await json<Page<NewsroomStory>>(await rep.req(`/api/newsroom/stories?limit=1&cursor=${paged.nextCursor}`));
    expect(next.items.map((s) => s.id)).toEqual([a.id]);

    // Too little data of your own → the platform's engagement pattern.
    const early = await json<NewsroomBestTimes>(await rep.req("/api/newsroom/best-times?tz=UTC"));
    expect(early.basis).toBe("platform");
    expect(early.byHour).toHaveLength(24);
    expect(early.byDay).toHaveLength(7);
    // 40 views one past Wednesday at 14:10 UTC → your audience's best slot.
    const at = pastWednesdayAt1410Utc();
    await db.insert(articleView).values(Array.from({ length: 40 }, () => ({ articleId: b.id, viewerKey: anonKey(), createdAt: at })));
    const utc = await json<NewsroomBestTimes>(await rep.req("/api/newsroom/best-times?tz=UTC"));
    expect(utc).toMatchObject({ basis: "you", timeZone: "UTC", best: { day: 2, hour: 14 } });
    expect(utc.sample).toBe(50); // 5 + 2 backdated + 40 views, 1 like, 2 shares
    expect(utc.bestHours[0]).toBe(14);
    expect(utc.bestDays[0]).toBe(2);
    const ist = await json<NewsroomBestTimes>(await rep.req("/api/newsroom/best-times?tz=Asia/Kolkata"));
    expect(ist.best).toEqual({ day: 2, hour: 19 }); // 14:10 UTC = 19:40 IST

    const bad = await rep.req("/api/newsroom/summary?range=5");
    expect(bad.status).toBe(400);
    expect((await json<ApiErrorBody>(bad)).error.code).toBe("validation_error");
    // Everyone else's numbers stay private: a second reporter sees only their own (empty) newsroom.
    const other = await reporterUser(app);
    const empty = await json<NewsroomSummary>(await other.req("/api/newsroom/summary"));
    expect(empty.totals).toEqual({ followers: 0, published: 0, inReview: 0, returned: 0, views: 0, likes: 0, shares: 0 });
    expect((await json<Page<NewsroomStory>>(await other.req("/api/newsroom/stories"))).items).toEqual([]);
  });

  it("lists In review and Returned stories for a Trainee", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const submit = async (title: string) => {
      const res = await trainee.req("/api/articles", { json: { title, bodyHtml: LONG_BODY, cover: await coverOf(trainee), articleImage: await coverOf(trainee), category: "national", ...PUBLISH_EXTRAS, action: "publish" } });
      expect(res.status, await res.clone().text()).toBe(201);
      return (await json<{ article: { id: string } }>(res)).article.id;
    };
    const returnedId = await submit("Trainee newsroom story that comes back");
    await desk.req(`/api/admin/review/${returnedId}/return`, { json: { note: "Name your source for the figures." } });
    const waitingId = await submit("Trainee newsroom story waiting for the desk");

    const stories = await json<Page<NewsroomStory>>(await trainee.req("/api/newsroom/stories"));
    expect(stories.items.map((s) => [s.id, s.status])).toEqual([
      [waitingId, "in_review"],
      [returnedId, "returned"],
    ]);
    expect(stories.items[1]?.reviewNote).toBe("Name your source for the figures.");
    const summary = await json<NewsroomSummary>(await trainee.req("/api/newsroom/summary"));
    expect(summary.totals).toMatchObject({ published: 0, inReview: 1, returned: 1 });
    expect(summary.pressPass).toMatchObject({ level: "trainee", approvedCount: 0 });
  });
});
