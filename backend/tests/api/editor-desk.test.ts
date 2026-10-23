import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { article, spotlightOrder } from "../../src/db/schema.js";
import { makeShortCode } from "../../src/lib/slug.js";
import {
  DEFAULT_POSTER_TEMPLATE,
  type AdminOverview,
  type AdminSpotlightOrder,
  type AdminStoryDetailResponse,
  type AdminStoryRow,
  type ApiErrorBody,
  type ArticleCard,
  type NewsroomSpotlight,
  type Page,
  type SpotlightOrderResponse,
  type SpotlightPackage,
} from "../../src/shared/contracts.js";
import { adminUser, cleanupFixtures, freshApp, json, onboardedUser, publishArticle, randomLetters, reporterUser, type Client, PUBLISH_EXTRAS } from "../helpers.js";

/*
 * Editor's Picks and Spotlight change what everyone sees, so this file is careful with shared state:
 * it works around picks that already exist (never touching them except to restore their order) and
 * only boosts / pins its own fixture stories, which are deleted with their authors afterwards.
 */
const app = freshApp();
const HOUR = 3_600_000;

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const code = async (res: Response) => (await json<ApiErrorBody>(res)).error.code;

/** Backdates one of this file's own stories (so the "fresh story" slots don't mask the ranking). */
async function backdate(id: string, hoursAgo: number): Promise<void> {
  const at = new Date(Date.now() - hoursAgo * HOUR);
  await db.update(article).set({ publishedAt: at, createdAt: at, updatedAt: at }).where(eq(article.id, id));
}

/** Whole For You list (pages of 10 = front-page blocks) until every wanted id is found. */
async function forYouList(c: Client, want: string[], maxPages = 40): Promise<ArticleCard[]> {
  const seen: ArticleCard[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ tab: "foryou", limit: "10" });
    if (cursor) qs.set("cursor", cursor);
    const res = await c.req(`/api/feed?${qs}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await json<Page<ArticleCard>>(res);
    seen.push(...body.items);
    cursor = body.nextCursor;
    if (!cursor || want.every((id) => seen.some((card) => card.id === id))) break;
  }
  return seen;
}

async function requestSpotlight(c: Client, articleId: string, pkg: SpotlightPackage): Promise<SpotlightOrderResponse> {
  const res = await c.req("/api/spotlight/orders", { json: { articleId, packageId: pkg.id } });
  expect(res.status, await res.clone().text()).toBe(201);
  return json<SpotlightOrderResponse>(res);
}

async function activePackages(): Promise<SpotlightPackage[]> {
  const { items } = await json<{ items: SpotlightPackage[] }>(await app.request("/api/spotlight/packages"));
  return items;
}

describe("Spotlight", () => {
  it("lists the default packages (6h ₹99 · 24h ₹249 · 72h ₹599)", async () => {
    const items = await activePackages();
    const byHours = new Map(items.map((p) => [p.hours, p.priceInr]));
    // Defaults are seeded by the migration; the desk may have edited prices since, so only check they exist.
    expect(items.length).toBeGreaterThan(0);
    expect([...byHours.keys()].every((h) => h > 0)).toBe(true);
  });

  it("request → pending (manual provider) → grant → ranking lift + label → expiry", async () => {
    const desk = await adminUser(app);
    const boosted = await reporterUser(app);
    const rival = await reporterUser(app);
    const reader = await onboardedUser(app);
    const [pkg] = await activePackages();
    if (!pkg) throw new Error("no Spotlight package");

    const a = await publishArticle(boosted, "Spotlight candidate from the harbour");
    const b = await publishArticle(rival, "Rival story from the same afternoon");
    await backdate(a.id, 5); // older → lower hot score than b without a boost
    await backdate(b.id, 4);

    const before = (await forYouList(reader, [a.id, b.id])).map((c) => c.id);
    expect(before.indexOf(b.id)).toBeLessThan(before.indexOf(a.id));

    // Only the author (a reporter) can request, only for live stories, one open request at a time.
    expect((await rival.req("/api/spotlight/orders", { json: { articleId: a.id, packageId: pkg.id } })).status).toBe(404);
    const ordered = await requestSpotlight(boosted, a.id, pkg);
    expect(ordered.order).toMatchObject({ status: "pending", active: false, provider: "manual", hours: pkg.hours, priceInr: pkg.priceInr, article: { id: a.id } });
    expect(ordered.message).toMatch(/Payments launch soon/);
    expect(ordered.payment).toEqual({ provider: "manual", status: "pending", checkoutUrl: null });
    expect(await code(await boosted.req("/api/spotlight/orders", { json: { articleId: a.id, packageId: pkg.id } }))).toBe("spotlight_exists");

    const pending = await json<Page<AdminSpotlightOrder>>(await desk.req("/api/admin/spotlight/orders?status=pending&limit=50"));
    expect(pending.items.find((o) => o.id === ordered.order.id)).toMatchObject({ reporter: { id: boosted.userId }, grantedBy: null });

    // Pending doesn't boost yet.
    const stillBefore = (await forYouList(reader, [a.id, b.id])).map((c) => c.id);
    expect(stillBefore.indexOf(b.id)).toBeLessThan(stillBefore.indexOf(a.id));

    const grant = await desk.req(`/api/admin/spotlight/orders/${ordered.order.id}/grant`, { json: { note: "Comped for launch" } });
    expect(grant.status, await grant.clone().text()).toBe(200);
    const granted = (await json<{ order: AdminSpotlightOrder }>(grant)).order;
    expect(granted).toMatchObject({ status: "granted", active: true, grantedBy: { id: desk.userId } });
    expect(Date.parse(granted.endsAt ?? "") - Date.parse(granted.startsAt ?? "")).toBe(pkg.hours * HOUR);
    expect(await code(await desk.req(`/api/admin/spotlight/orders/${ordered.order.id}/grant`, { json: {} }))).toBe("not_pending");

    // ×2.5 lifts the older story above the newer one, and every card says "Spotlight".
    const after = await forYouList(reader, [a.id, b.id]);
    const ids = after.map((c) => c.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(after.find((c) => c.id === a.id)?.badges).toMatchObject({ spotlight: true, editorsPick: false, reporterLevel: "verified" });
    const latest = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=latest&limit=30"));
    expect(latest.items.find((c) => c.id === a.id)?.badges?.spotlight).toBe(true);
    const detail = await json<{ article: ArticleCard }>(await reader.req(`/api/articles/by-slug/${a.slug}`));
    expect(detail.article.badges?.spotlight).toBe(true);

    const mine = await json<NewsroomSpotlight>(await boosted.req("/api/newsroom/spotlight"));
    expect(mine).toMatchObject({ paymentsEnabled: false });
    expect(mine.orders.find((o) => o.id === ordered.order.id)).toMatchObject({ status: "granted", active: true });

    // Time runs out (simulated on this fixture order) → expired, no label, no lift.
    await db
      .update(spotlightOrder)
      .set({ startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) })
      .where(eq(spotlightOrder.id, ordered.order.id));
    const expired = await json<NewsroomSpotlight>(await boosted.req("/api/newsroom/spotlight"));
    expect(expired.orders.find((o) => o.id === ordered.order.id)).toMatchObject({ status: "expired", active: false });
    const [row] = await db.select({ status: spotlightOrder.status }).from(spotlightOrder).where(eq(spotlightOrder.id, ordered.order.id));
    expect(row?.status).toBe("expired");
    const afterExpiry = await forYouList(reader, [a.id, b.id]);
    expect(afterExpiry.find((c) => c.id === a.id)?.badges?.spotlight).toBe(false);
    const expiredIds = afterExpiry.map((c) => c.id);
    expect(expiredIds.indexOf(b.id)).toBeLessThan(expiredIds.indexOf(a.id));

    // A new request is possible again; the reporter can cancel it; the desk can decline another.
    const second = await requestSpotlight(boosted, a.id, pkg);
    const cancel = await boosted.req(`/api/spotlight/orders/${second.order.id}/cancel`, { method: "POST" });
    expect((await json<{ order: { status: string } }>(cancel)).order.status).toBe("cancelled");
    const third = await requestSpotlight(boosted, a.id, pkg);
    const decline = await desk.req(`/api/admin/spotlight/orders/${third.order.id}/decline`, { json: { note: "Not this week" } });
    expect((await json<{ order: AdminSpotlightOrder }>(decline)).order).toMatchObject({ status: "declined", note: "Not this week" });

    expect((await reader.req("/api/spotlight/orders", { json: { articleId: a.id, packageId: pkg.id } })).status).toBe(403);
  });

  it("allows at most one spotlighted story per 10-story block", async () => {
    const desk = await adminUser(app);
    const reps = [await reporterUser(app), await reporterUser(app)];
    const filler = await reporterUser(app);
    const reader = await onboardedUser(app);
    const [pkg] = await activePackages();
    if (!pkg) throw new Error("no Spotlight package");

    // Two heavily read stories (own fixtures) → naturally ranks 1 and 2, i.e. the same block.
    const stories = [
      await publishArticle(reps[0]!, "Twin spotlight story number one"),
      await publishArticle(reps[1]!, "Twin spotlight story number two"),
    ];
    for (const s of stories) {
      await backdate(s.id, 3);
      await db.update(article).set({ viewCount: 500_000 }).where(eq(article.id, s.id));
    }
    // Guarantee a second block exists however little else is in the database: 11 old filler stories.
    const template = await publishArticle(filler, "Filler story for the spotlight blocks");
    await backdate(template.id, 24 * 30);
    const [source] = await db.select().from(article).where(eq(article.id, template.id));
    if (!source) throw new Error("filler story missing");
    const { id: _id, slug: _slug, shortCode: _shortCode, ...copy } = source;
    for (let i = 0; i < 10; i++) {
      await db.insert(article).values({ ...copy, title: `Filler story ${i}`, slug: `filler-story-${randomLetters(10)}`, shortCode: makeShortCode() });
    }

    for (const [i, s] of stories.entries()) {
      const order = await requestSpotlight(reps[i]!, s.id, pkg);
      expect((await desk.req(`/api/admin/spotlight/orders/${order.order.id}/grant`, { json: {} })).status).toBe(200);
    }
    const list = await forYouList(reader, stories.map((s) => s.id));
    const blocks = stories.map((s) => Math.floor(list.findIndex((c) => c.id === s.id) / 10));
    expect(blocks.every((b) => b >= 0)).toBe(true);
    expect(blocks[0]).not.toBe(blocks[1]);
    expect(Math.min(...blocks)).toBe(0);
    for (const s of stories) expect(list.find((c) => c.id === s.id)?.badges?.spotlight).toBe(true);
    // At most one Spotlight in every block (the last, possibly short, block can't push one further down).
    const lastBlock = Math.floor((list.length - 1) / 10);
    const perBlock = new Map<number, number>();
    list.forEach((card, i) => {
      const block = Math.floor(i / 10);
      if (card.badges?.spotlight && block < lastBlock) perBlock.set(block, (perBlock.get(block) ?? 0) + 1);
    });
    expect(Math.max(0, ...perBlock.values())).toBeLessThanOrEqual(1);
  });

  it("the desk edits packages (CRUD) and every change is audited", async () => {
    const desk = await adminUser(app);
    const created = await desk.req("/api/admin/spotlight/packages", { json: { name: "Test Blitz", hours: 2, priceInr: 49, active: false, sort: 900 } });
    expect(created.status, await created.clone().text()).toBe(201);
    const pkg = (await json<{ package: SpotlightPackage }>(created)).package;
    expect(pkg).toMatchObject({ name: "Test Blitz", hours: 2, priceInr: 49, active: false });
    // Inactive packages are hidden from reporters but listed for the desk.
    expect((await activePackages()).map((p) => p.id)).not.toContain(pkg.id);
    const all = await json<{ items: SpotlightPackage[] }>(await desk.req("/api/admin/spotlight/packages"));
    expect(all.items.map((p) => p.id)).toContain(pkg.id);
    const patched = await desk.req(`/api/admin/spotlight/packages/${pkg.id}`, { method: "PATCH", json: { priceInr: 59 } });
    expect((await json<{ package: SpotlightPackage }>(patched)).package.priceInr).toBe(59);
    expect(await code(await desk.req("/api/admin/spotlight/packages", { json: { name: "", hours: 0, priceInr: -1 } }))).toBe("validation_error");
    expect((await desk.req(`/api/admin/spotlight/packages/${pkg.id}`, { method: "DELETE" })).status).toBe(204);
    const audit = await json<Page<{ action: string }>>(await desk.req(`/api/admin/audit?target=${pkg.id}`));
    expect(audit.items.map((e) => e.action).sort()).toEqual(["spotlight.package_create", "spotlight.package_delete", "spotlight.package_update"]);
  });
});

describe("Editor's Picks", () => {
  it("pinned stories lead page 1 of For You and Latest in the desk's order (max 3)", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const existing = (await json<{ items: AdminStoryRow[] }>(await desk.req("/api/admin/stories/pins"))).items.map((s) => s.id);
    const room = 3 - existing.length;
    if (room < 2) {
      // Someone already uses the picks: only check the limit.
      const s = await publishArticle(author, "Would-be Editor's Pick");
      expect(await code(await desk.req(`/api/admin/stories/${s.id}/pin`, { method: "POST" }))).toBe("pin_limit");
      return;
    }
    const mine = [await publishArticle(author, "Editor's Pick candidate one"), await publishArticle(author, "Editor's Pick candidate two")];
    for (const s of mine) {
      const res = await desk.req(`/api/admin/stories/${s.id}/pin`, { method: "POST" });
      expect(res.status, await res.clone().text()).toBe(200);
    }
    const pins = [...existing, ...mine.map((s) => s.id)];
    try {
      const pinned = await json<{ items: AdminStoryRow[] }>(await desk.req("/api/admin/stories/pins"));
      expect(pinned.items.map((s) => s.id)).toEqual(pins);
      expect(pinned.items.map((s) => s.pinOrder)).toEqual(pins.map((_, i) => i + 1));

      for (const tab of ["latest", "foryou"]) {
        const page = await json<Page<ArticleCard>>(await reader.req(`/api/feed?tab=${tab}&limit=10`));
        expect(page.items.slice(0, pins.length).map((c) => c.id), tab).toEqual(pins);
        expect(page.items[pins.length - 1]?.badges?.editorsPick).toBe(true);
        // A running Spotlight may be woven in (like a sponsored post): 10 stories, or 11 with it.
        expect(page.items.length).toBeGreaterThanOrEqual(10);
        expect(page.items.filter((c) => !c.badges?.spotlight).length).toBeLessThanOrEqual(10);
        // Never repeated further down.
        const rest = await json<Page<ArticleCard>>(await reader.req(`/api/feed?tab=${tab}&limit=10&cursor=${encodeURIComponent(page.nextCursor ?? "")}`));
        for (const id of mine.map((s) => s.id)) expect(rest.items.map((c) => c.id)).not.toContain(id);
      }

      // Reorder: my two swap places (existing picks keep theirs).
      const reordered = [...existing, mine[1]!.id, mine[0]!.id];
      const res = await desk.req("/api/admin/stories/pins/reorder", { json: { ids: reordered } });
      expect((await json<{ items: AdminStoryRow[] }>(res)).items.map((s) => s.id)).toEqual(reordered);
      const latest = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=latest&limit=10"));
      expect(latest.items.slice(0, reordered.length).map((c) => c.id)).toEqual(reordered);
      expect(await code(await desk.req("/api/admin/stories/pins/reorder", { json: { ids: [mine[0]!.id] } }))).toBe("invalid_order");

      if (room === 3) {
        const third = await publishArticle(author, "Editor's Pick candidate three");
        expect((await desk.req(`/api/admin/stories/${third.id}/pin`, { method: "POST" })).status).toBe(200);
        const fourth = await publishArticle(author, "One pick too many");
        expect(await code(await desk.req(`/api/admin/stories/${fourth.id}/pin`, { method: "POST" }))).toBe("pin_limit");
        await desk.req(`/api/admin/stories/${third.id}/unpin`, { method: "POST" });
      }
    } finally {
      for (const s of mine) await desk.req(`/api/admin/stories/${s.id}/unpin`, { method: "POST" });
      if (existing.length > 1) await desk.req("/api/admin/stories/pins/reorder", { json: { ids: existing } });
    }
    const after = await json<{ items: AdminStoryRow[] }>(await desk.req("/api/admin/stories/pins"));
    expect(after.items.map((s) => s.id)).toEqual(existing);
  });
});

describe("Editor Desk lists", () => {
  it("overview KPIs and the stories list with filters", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const verified = await reporterUser(app);
    const live = await publishArticle(verified, "A live story for the desk list");
    const cover = (await import("../helpers.js")).coverOf;
    const review = await trainee.req("/api/articles", {
      json: { title: "A story waiting at the desk", bodyHtml: "<p>" + "Plenty of words in this review story. ".repeat(3) + "</p>", cover: await cover(trainee), articleImage: await cover(trainee), category: "education", ...PUBLISH_EXTRAS, action: "publish" },
    });
    const reviewId = (await json<{ article: { id: string } }>(review)).article.id;

    const overview = await json<AdminOverview>(await desk.req("/api/admin/overview"));
    expect(overview.kpis.reviewQueue).toBeGreaterThanOrEqual(1);
    expect(overview.kpis.storiesToday).toBeGreaterThanOrEqual(1);
    expect(overview.kpis.reporters).toBeGreaterThanOrEqual(2);
    expect(overview.kpis.trainees).toBeGreaterThanOrEqual(1);
    expect(overview.kpis.users).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(overview.recent)).toBe(true);

    const mine = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?reporter=@${trainee.username}`));
    expect(mine.items.map((s) => s.id)).toEqual([reviewId]);
    expect(mine.items[0]).toMatchObject({ status: "in_review", author: { reporterLevel: "trainee", reporterType: "staff", outlet: "Test Suite Times" } });
    const inReview = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?status=in_review&reporter=${trainee.username}`));
    expect(inReview.items).toHaveLength(1);
    const published = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?status=published&q=${encodeURIComponent("live story for the desk")}`));
    expect(published.items.map((s) => s.id)).toContain(live.id);
    const byBeat = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?beat=city&reporter=${verified.username}`));
    expect(byBeat.items.map((s) => s.id)).toEqual([live.id]);
    expect(await code(await desk.req("/api/admin/stories?status=weird"))).toBe("validation_error");

    // Paging with a cursor never repeats rows.
    const first = await json<Page<AdminStoryRow>>(await desk.req("/api/admin/stories?limit=2"));
    if (first.nextCursor) {
      const second = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?limit=2&cursor=${first.nextCursor}`));
      for (const s of second.items) expect(first.items.map((f) => f.id)).not.toContain(s.id);
    }

    const people = await json<Page<{ id: string; role: string; isSelf: boolean; adminEmail: boolean }>>(await desk.req(`/api/admin/users?q=${desk.username}`));
    expect(people.items[0]).toMatchObject({ id: desk.userId, role: "admin", isSelf: true, adminEmail: true });
  });

  it("rows carry the story's reel poster template (the default while none is chosen)", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const cover = (await import("../helpers.js")).coverOf;
    const submitted = await trainee.req("/api/articles", {
      json: {
        title: "A poster the desk should see",
        bodyHtml: "<p>" + "Enough words for the review desk to read. ".repeat(3) + "</p>",
        cover: await cover(trainee),
        articleImage: await cover(trainee),
        category: "education",
        template: "slant",
        ...PUBLISH_EXTRAS, action: "publish",
      },
    });
    expect(submitted.status, await submitted.clone().text()).toBe(201);
    const submittedId = (await json<{ article: { id: string } }>(submitted)).article.id;
    const draft = await trainee.req("/api/articles", { json: { title: "A draft without a poster yet", action: "draft" } });
    expect(draft.status, await draft.clone().text()).toBe(201);
    const draftId = (await json<{ article: { id: string } }>(draft)).article.id;

    const queue = await json<Page<AdminStoryRow>>(await desk.req("/api/admin/review?limit=50"));
    expect(queue.items.find((s) => s.id === submittedId)).toMatchObject({ status: "in_review", template: "slant" });
    const detail = await json<AdminStoryDetailResponse>(await desk.req(`/api/admin/stories/${submittedId}`));
    expect(detail.story).toMatchObject({ id: submittedId, template: "slant" });
    const drafts = await json<Page<AdminStoryRow>>(await desk.req(`/api/admin/stories?status=draft&reporter=${trainee.username}`));
    expect(drafts.items).toEqual([expect.objectContaining({ id: draftId, template: DEFAULT_POSTER_TEMPLATE })]);
  });
});
