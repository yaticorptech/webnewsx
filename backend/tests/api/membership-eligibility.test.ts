import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db/client.js";
import { membershipRules, sendRenewalReminders, setMembershipRules } from "../../src/queries/memberships.js";
import { phonePushFor, type QueuedRow } from "../../src/queries/push.js";
import type {
  AccountSettings,
  AppNotification,
  ArticleDetail,
  MembershipCheckout,
  MembershipOrder,
  NotificationsResponse,
  ProfileData,
} from "../../src/shared/contracts.js";
import { cleanupFixtures, freshApp, json, randomLetters, signUp, trackUser, type Client } from "../helpers.js";

/*
 * Premium membership rules (owner 2026-10-16): only a Verified reporter with 100 followers who has published on 30
 * different days (any days — gaps don't reset anything) may set a membership price — then a reader can buy it and read the members-only story.
 * Fixtures are written straight to the database (the shared helpers predate the newer username / story rules); every
 * request then goes through the real API.
 */

const app = freshApp();
const DAY = 86_400_000;
let reporter: Client & { userId: string; username: string };
let reader: Client & { userId: string };
let premiumSlug = "";

/** India-time noon `daysAgo` days back (so each story lands on its own IST day). */
const istNoon = (daysAgo: number) => {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  ist.setUTCHours(12, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3_600_000 - daysAgo * DAY);
};

async function makeOnboarded(userId: string, username: string, role: "reader" | "reporter", level: "verified" | "trainee" | null) {
  await db.execute(sql`
    update "user" set username = ${username}, name = ${username}, onboarded_at = now(), terms_accepted_at = now(),
      role = ${role}, reporter_level = ${level} where id = ${userId}`);
}

async function postOn(daysAgo: number, premium = false): Promise<string> {
  const slug = `t-${randomLetters(10)}`;
  await db.execute(sql`
    insert into article (id, author_id, title, slug, status, published_at, category, subcategory, body_html, blurb, premium, cover_url)
    values (${randomUUID()}, ${reporter.userId}, ${`Test story ${slug}`}, ${slug}, 'published', ${istNoon(daysAgo).toISOString()}::timestamptz,
      'national', 'Other', '<p>Members-only secret paragraph.</p>', 'A test blurb that is long enough to pass the rules.', ${premium}, 'https://example.com/cover.jpg')`);
  return slug;
}

async function account(c: Client): Promise<AccountSettings> {
  const res = await c.req("/api/me/account");
  expect(res.status).toBe(200);
  return json<AccountSettings>(res);
}

async function bell(c: Client): Promise<AppNotification[]> {
  const res = await c.req("/api/me/notifications");
  expect(res.status).toBe(200);
  return (await json<NotificationsResponse>(res)).items;
}

/** A bell row as the push worker reads it (only what membership pushes use). */
const queued = (id: string, type: "membership_ending" | "membership_ended", days: number): QueuedRow =>
  ({
    id,
    user_id: reader.userId,
    type,
    amount: days,
    actor_name: reporter.username,
    actor_username: reporter.username,
    actor_image: null,
    cover_url: null,
    conversation_id: null,
  }) as unknown as QueuedRow;

const progress = (eligibility: AccountSettings["membershipEligibility"], metric: string) =>
  eligibility?.rules.find((rule) => rule.metric === metric);

const setPrice = (price: number | null) => reporter.req("/api/me/membership-price", { method: "PUT", json: { price } });

let savedRules: Awaited<ReturnType<typeof membershipRules>> | null = null;

beforeAll(async () => {
  savedRules = await membershipRules();
  await db.execute(sql`delete from site_setting where key = 'membership.rules'`);
  const r = await signUp(app);
  const username = `memtest.${randomLetters(8)}`;
  await makeOnboarded(r.userId, username, "reporter", "verified");
  reporter = Object.assign(r, { username });
  reader = await signUp(app);
  await makeOnboarded(reader.userId, `memreader.${randomLetters(8)}`, "reader", null);
});

afterAll(async () => {
  // This test's rule changes out of the audit log, then the Desk's own rules back as they were (or the defaults).
  await db.execute(sql`delete from admin_audit_log where action = 'membership.rules' and actor_id = ${reader.userId}`);

  await db.execute(sql`delete from site_setting where key = 'membership.rules'`);
  if (savedRules?.updatedAt) await db.execute(sql`insert into site_setting (key, value) values ('membership.rules', ${JSON.stringify({ rules: savedRules.rules })}::jsonb)`);
  // The 100 follower rows are plain inserts (not sign-ups): removed here, then the signed-up fixtures.
  await db.execute(sql`delete from "user" where id like 'memfan\\_%' and email like '%@memtest.invalid'`);
  await cleanupFixtures();
});

describe("premium membership rules", () => {
  it("is locked for a new Verified reporter (no followers, no posting streak)", async () => {
    const { membershipEligibility } = await account(reporter);
    expect(membershipEligibility?.eligible).toBe(false);
    expect(progress(membershipEligibility, "verified")).toMatchObject({ done: true });
    expect(progress(membershipEligibility, "followers")).toMatchObject({ current: 0, target: 100, done: false });
    expect(progress(membershipEligibility, "posting_days")).toMatchObject({ current: 0, target: 30, done: false });
    const res = await setPrice(49);
    expect(res.status).toBe(403);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe("membership_not_eligible");
  });

  it("stays locked with 100 followers but stories on only 29 days (with gaps between them)", async () => {
    // 100 followers.
    const prefix = `memfan_${randomLetters(10)}_`;
    for (let n = 1; n <= 100; n++) trackUser(`${prefix}${n}`);
    await db.execute(sql`insert into "user" (id, name, email) select ${prefix} || n, ${prefix} || n, ${prefix} || n || '@memtest.invalid' from generate_series(1, 100) n`);
    await db.execute(sql`insert into follow (follower_id, following_id) select ${prefix} || n, ${reporter.userId} from generate_series(1, 100) n`);
    // 29 different days spread over ~3 months, with gaps (every third day) — and two stories on one day (counts once).
    for (let n = 1; n <= 29; n++) await postOn(n * 3);
    await postOn(3);
    const { membershipEligibility } = await account(reporter);
    expect(membershipEligibility).toMatchObject({ eligible: false, postedToday: false });
    expect(progress(membershipEligibility, "followers")).toMatchObject({ current: 100, done: true });
    expect(progress(membershipEligibility, "posting_days")).toMatchObject({ current: 29, done: false });
    expect((await setPrice(49)).status).toBe(403);
  });

  it("opens on the 30th day with a story — the price can be set", async () => {
    await postOn(0);
    const { membershipEligibility } = await account(reporter);
    expect(membershipEligibility).toMatchObject({ eligible: true, postedToday: true });
    expect(progress(membershipEligibility, "posting_days")).toMatchObject({ current: 30, done: true });
    const res = await setPrice(49);
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await account(reporter)).membershipPrice).toBe(49);
  });

  it("locks again for a Trainee, even with the 30 days and followers", async () => {
    await db.execute(sql`update "user" set reporter_level = 'trainee' where id = ${reporter.userId}`);
    expect((await account(reporter)).membershipEligibility?.eligible).toBe(false);
    expect((await setPrice(59)).status).toBe(403);
    // Turning it off is always allowed — then back on as Verified.
    await db.execute(sql`update "user" set reporter_level = 'verified' where id = ${reporter.userId}`);
  });

  it("a reader can buy it and read the members-only story", async () => {
    premiumSlug = await postOn(0, true);
    // Not a member: the story is locked, with the price on the paywall.
    let res = await reader.req(`/api/articles/by-slug/${premiumSlug}`);
    expect(res.status).toBe(200);
    let story = (await json<{ article: ArticleDetail }>(res)).article;
    expect(story.locked).toBe(true);
    expect(story.bodyHtml).toBe("");
    expect(story.paywall?.priceInr).toBe(49);

    // Checkout shows the reporter's price; paying (test provider: no Razorpay keys in development) makes them a member.
    res = await reader.req(`/api/memberships/${reporter.username}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const checkout = await json<MembershipCheckout>(res);
    expect(checkout.priceInr).toBe(49);
    expect(checkout.activeUntil).toBeNull();
    res = await reader.req(`/api/memberships/${reporter.username}/orders`, { method: "POST" });
    expect(res.status, await res.clone().text()).toBe(201);
    const order = await json<MembershipOrder>(res);
    expect(order.kind).toBe("paid");

    // Now a member: the story opens and the profile says until when.
    res = await reader.req(`/api/articles/by-slug/${premiumSlug}`);
    story = (await json<{ article: ArticleDetail }>(res)).article;
    expect(story.locked).toBe(false);
    expect(story.bodyHtml).toContain("Members-only secret paragraph");
    res = await reader.req(`/api/users/${reporter.username}`);
    const profile = await json<ProfileData>(res);
    expect(profile.membership?.activeUntil).toBeTruthy();
    const days = (Date.parse(profile.membership!.activeUntil!) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("reminds the reader before it ends — in the bell and as a phone push with Renew", async () => {
    // Two days left on the reader's membership.
    await db.execute(sql`update membership_payment set period_end = now() + interval '2 days' where member_id = ${reader.userId}`);
    await sendRenewalReminders();
    await sendRenewalReminders(); // a second run must not repeat it
    const items = await bell(reader);
    const ending = items.filter((n) => n.type === "membership_ending");
    expect(ending).toHaveLength(1);
    expect(ending[0]).toMatchObject({ amount: 2, read: false, actor: { username: reporter.username } });

    // The push it becomes: who, how long, a Renew button straight to the checkout.
    const push = phonePushFor(queued(ending[0]!.id, "membership_ending", 2));
    expect(push?.title).toBe(`Your premium membership of ${reporter.username} ends in 2 days`);
    expect(push?.url).toBe(`/membership/${reporter.username}`);
    expect(push?.action).toEqual({ label: "Renew", url: `/membership/${reporter.username}` });
  });

  it("tells the reader when it has ended, and the story locks again", async () => {
    await db.execute(sql`update membership_payment set period_end = now() - interval '1 hour', period_start = now() - interval '30 days' where member_id = ${reader.userId}`);
    await sendRenewalReminders();
    await sendRenewalReminders();
    const ended = (await bell(reader)).filter((n) => n.type === "membership_ended");
    expect(ended).toHaveLength(1);
    expect(ended[0]?.actor?.username).toBe(reporter.username);
    const push = phonePushFor(queued(ended[0]!.id, "membership_ended", 0));
    expect(push?.title).toBe(`Your premium membership of ${reporter.username} has ended`);
    expect(push?.action?.label).toBe("Renew");

    const res = await reader.req(`/api/articles/by-slug/${premiumSlug}`);
    expect((await json<{ article: ArticleDetail }>(res)).article.locked).toBe(true);
  });

  it("renewing makes them a member again for 30 days, with no more reminders", async () => {
    const res = await reader.req(`/api/memberships/${reporter.username}/orders`, { method: "POST" });
    expect(res.status, await res.clone().text()).toBe(201);
    const order = await json<MembershipOrder>(res);
    expect(order.kind).toBe("paid");
    if (order.kind !== "paid") return;
    const days = (Date.parse(order.activeUntil) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    const story = await reader.req(`/api/articles/by-slug/${premiumSlug}`);
    expect((await json<{ article: ArticleDetail }>(story)).article.locked).toBe(false);

    const before = (await bell(reader)).length;
    await sendRenewalReminders();
    expect((await bell(reader)).length).toBe(before);
  });

  it("follows the Desk's rules: a raised number locks it, a new rule shows up, a switched-off rule is skipped", async () => {
    // Followers 100 → 150: locked, with the new number on the reporter's card.
    await setMembershipRules(reader.userId, [
      { metric: "verified", value: 1, enabled: true },
      { metric: "followers", value: 150, enabled: true },
      { metric: "posting_days", value: 30, enabled: true },
    ]);
    let rules = (await account(reporter)).membershipEligibility;
    expect(rules?.eligible).toBe(false);
    expect(progress(rules, "followers")).toMatchObject({ title: "Have 150 followers", current: 100, target: 150, done: false });
    expect((await setPrice(59)).status).toBe(403);

    // Back to 100, plus a new rule — 31 published stories (they have 31): open again, and the new rule is listed.
    await setMembershipRules(reader.userId, [
      { metric: "verified", value: 1, enabled: true },
      { metric: "followers", value: 100, enabled: true },
      { metric: "posting_days", value: 30, enabled: true },
      { metric: "stories", value: 31, enabled: true },
    ]);
    rules = (await account(reporter)).membershipEligibility;
    expect(progress(rules, "stories")).toMatchObject({ title: "Publish 31 stories", done: true });
    expect(rules?.eligible).toBe(true);

    // A new rule they don't meet (1,000 likes) — but switched off: skipped, still open.
    await setMembershipRules(reader.userId, [
      { metric: "verified", value: 1, enabled: true },
      { metric: "followers", value: 100, enabled: true },
      { metric: "posting_days", value: 30, enabled: true },
      { metric: "likes", value: 1000, enabled: false },
    ]);
    rules = (await account(reporter)).membershipEligibility;
    expect(progress(rules, "likes")).toBeUndefined();
    expect(rules?.eligible).toBe(true);
    expect((await setPrice(59)).status).toBe(200);
  });

  it("can always be turned off", async () => {
    const res = await setPrice(null);
    expect(res.status).toBe(200);
    expect((await account(reporter)).membershipPrice).toBeNull();
  });
});
