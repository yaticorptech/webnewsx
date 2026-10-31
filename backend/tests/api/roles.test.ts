import { and, desc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { beforeSessionCreate } from "../../src/auth.js";
import { closeDatabase, db } from "../../src/db/client.js";
import { account, session as sessionTable, user as userTable } from "../../src/db/schema.js";
import { claimUnverifiedAccount, verifyEmailAddress } from "../../src/lib/admin-emails.js";
import { DESK_SESSION_HOURS } from "../../src/lib/desk-sign-in.js";
import { adminEmails } from "../../src/lib/roles.js";
import type {
  AdminReporterRow,
  AdminStoryRow,
  ApiErrorBody,
  ArticleCard,
  AuditEntry,
  DraftCard,
  Headline,
  NoticesResponse,
  OwnedArticle,
  Page,
  PressPass,
  PressPassOptions,
  SaveArticleResponse,
  TrendingHeadline,
  UserRow,
  ViewerUser,
} from "../../src/shared/contracts.js";
import {
  LONG_BODY,
  PASS_APPLICATION,
  PASSWORD,
  adminUser,
  applyPressPass,
  cleanupFixtures,
  client,
  coverOf,
  freshApp,
  json,
  logIn,
  onboard,
  onboardedUser,
  publishArticle,
  reporterUser,
  setFixtureLevel,
  signUp,
  testEmail,
  testMobile,
  testUsername,
  upload,
  type Client, PUBLISH_EXTRAS } from "../helpers.js";

/*
 * SPEC §3.11 roles against the shared database: every assertion is about this file's own fixtures.
 */
const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const code = async (res: Response) => (await json<ApiErrorBody>(res)).error.code;
const me = async (c: Client) => (await json<{ viewer: ViewerUser | null }>(await c.req("/api/me"))).viewer;
const latestIds = async (c: Client = client(app)) =>
  (await json<Page<ArticleCard>>(await c.req("/api/feed?tab=latest&limit=30"))).items.map((i) => i.id);

async function submit(c: Client, title: string): Promise<SaveArticleResponse> {
  const cover = await coverOf(c);
  const res = await c.req("/api/articles", { json: { title, bodyHtml: LONG_BODY, cover, articleImage: cover, category: "national", ...PUBLISH_EXTRAS, action: "publish" } });
  expect(res.status, await res.clone().text()).toBe(201);
  return json<SaveArticleResponse>(res);
}

describe("role guards", () => {
  it("new accounts are Readers: no publishing, no covers, no Newsroom, no Editor Desk", async () => {
    const reader = await onboardedUser(app);
    expect(reader.user).toMatchObject({ role: "reader", reporterLevel: null, pressPass: null, suspended: false });

    const draft = await reader.req("/api/articles", { json: { title: "Can I?", action: "draft" } });
    expect(draft.status).toBe(403);
    expect(await code(draft)).toBe("press_pass_required");
    const publish = await reader.req("/api/articles", { json: { title: "Can I?", ...PUBLISH_EXTRAS, action: "publish" } });
    expect(await code(publish)).toBe("press_pass_required");

    const cover = await upload(reader, "cover");
    expect(cover.status).toBe(403);
    expect(await code(cover)).toBe("press_pass_required");
    expect((await upload(reader, "avatar")).status).toBe(201);

    const newsroom = await reader.req("/api/newsroom/summary");
    expect(newsroom.status).toBe(403);
    expect(await code(newsroom)).toBe("press_pass_required");
    const spotlight = await reader.req("/api/spotlight/orders", { json: { articleId: crypto.randomUUID(), packageId: crypto.randomUUID() } });
    expect(await code(spotlight)).toBe("press_pass_required");

    for (const path of ["/api/admin/overview", "/api/admin/review", "/api/admin/users", "/api/admin/audit"]) {
      const res = await reader.req(path);
      expect(res.status, path).toBe(403);
      expect(await code(res)).toBe("admin_only");
      expect((await client(app).req(path)).status, path).toBe(401);
    }
    const reporter = await reporterUser(app);
    expect((await reporter.req("/api/admin/overview")).status).toBe(403);
    expect((await reporter.req("/api/admin/stories/00000000-0000-4000-8000-000000000000/hide", { json: { reason: "x" } })).status).toBe(403);
  });
});

describe("Press Pass", () => {
  it("serves the application options (reporter types, experience, languages, Indian states with Karnataka first, KA districts, pledge)", async () => {
    const options = await json<PressPassOptions>(await app.request("/api/press-pass/options"));
    expect(options.reporterTypes.map((t) => t.label)).toEqual(["Citizen journalist", "Freelance journalist", "Staff reporter"]);
    expect(options.reporterTypes[0]?.hint).toBeTruthy();
    expect(options.experience.map((e) => e.value)).toEqual(["new", "1_2", "3_5", "6_10", "10_plus"]);
    expect(options.languages.slice(0, 3).map((l) => l.label)).toEqual(["Kannada", "English", "Hindi"]);
    expect(options.languages.map((l) => l.label)).toEqual(expect.arrayContaining(["Tulu", "Konkani", "Tamil", "Urdu", "Santali"]));
    expect(options.languages.at(-1)?.value).toBe("other");
    // A–Z since 2026-10-05 (Karnataka used to come first).
    expect(options.regions[0]).toMatchObject({ code: "AN" });
    expect(options.regions).toEqual(expect.arrayContaining([expect.objectContaining({ code: "KA", name: "Karnataka" })]));
    expect(options.regions.length).toBe(36);
    expect(options.districts.KA).toContain("Mysuru");
    expect(options.pledge.length).toBe(5);
  });

  it("validates the application, issues a Trainee pass instantly and refuses a second one", async () => {
    const reader = await onboardedUser(app);
    expect(await json(await reader.req("/api/press-pass"))).toEqual({ pressPass: null });

    const bad = async (patch: Record<string, unknown>, field: string) => {
      const res = await reader.req("/api/press-pass", { json: { ...PASS_APPLICATION(), ...patch } });
      expect(res.status, field).toBe(400);
      expect((await json<ApiErrorBody>(res)).error.fields?.[field], field).toBeTruthy();
    };
    await bad({ mobile: "" }, "mobile");
    await bad({ mobile: "98450" }, "mobile");
    await bad({ mobile: "5845012345" }, "mobile");
    // International numbers are accepted with their country code (the Press Pass country picker).
    await bad({ reporterType: "blogger" }, "reporterType");
    await bad({ reporterType: "staff", outlet: "  " }, "outlet");
    await bad({ experience: "forever" }, "experience");
    await bad({ state: "XX" }, "state");
    await bad({ district: "Atlantis" }, "district");
    await bad({ city: "  " }, "city");
    await bad({ languages: [] }, "languages");
    await bad({ about: "" }, "about");
    await bad({ links: ["javascript:alert(1)"] }, "links.0");
    await bad({ links: ["https://a.example", "https://b.example", "https://c.example", "https://d.example"] }, "links");
    await bad({ acceptPledge: false }, "acceptPledge");
    await bad({ pledgeSignature: "Someone Else" }, "pledgeSignature");
    // Personal details (owner 2026-10-07): 18+, a 6-digit PIN code, a listed ID (no Aadhaar) in its own format.
    await bad({ legalName: "" }, "legalName");
    await bad({ dateOfBirth: "2015-06-01" }, "dateOfBirth");
    await bad({ dateOfBirth: "1990-02-30" }, "dateOfBirth");
    await bad({ address: "" }, "address");
    await bad({ pincode: "012345" }, "pincode");
    // Aadhaar is accepted, masked (only the last 4 digits are kept).
    await bad({ idType: "pan", idNumber: "1234" }, "idNumber");

    // Other states take a free-text district; the mobile number is stored as +91XXXXXXXXXX.
    const mobile = testMobile();
    const application = PASS_APPLICATION("  test   PUBLISHER ");
    const personal = {
      legalName: application.legalName.trim(),
      dateOfBirth: application.dateOfBirth,
      address: application.address,
      pincode: application.pincode,
      idType: application.idType,
      idNumber: application.idNumber,
    };
    const res = await reader.req("/api/press-pass", {
      // The ID number is stored in capitals without spaces.
      json: { ...application, idNumber: ` ${application.idNumber.toLowerCase().slice(0, 5)} ${application.idNumber.slice(5)}`, mobile: `+91 ${mobile.slice(0, 5)}-${mobile.slice(5)}`, state: "MH", district: "Pune", city: "Pune" },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const body = await json<{ pressPass: PressPass; viewer: ViewerUser }>(res);
    expect(body.pressPass).toMatchObject({
      level: "trainee",
      status: "active",
      approvedCount: 0,
      approvalsToVerify: 3,
      complete: true,
      mobile: `+91${mobile}`,
      ...personal,
      reporterType: "staff",
      outlet: "Test Suite Times",
      experience: "3_5",
      state: "MH",
      stateName: "Maharashtra",
      district: "Pune",
      city: "Pune",
      languages: ["kn", "en"],
      links: ["https://www.example.com/portfolio"],
      holder: { id: reader.userId, username: reader.username },
    });
    expect(body.pressPass.passNumber).toMatch(/^WN-MH-\d{6}$/);
    expect(body.viewer).toMatchObject({ role: "reporter", reporterLevel: "trainee", pressPass: { passNumber: body.pressPass.passNumber, level: "trainee" } });
    expect(await me(reader)).toMatchObject({ role: "reporter", reporterLevel: "trainee" });

    const again = await reader.req("/api/press-pass", { json: PASS_APPLICATION() });
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("already_reporter");

    // One Press Pass per mobile number.
    const other = await onboardedUser(app);
    const taken = await other.req("/api/press-pass", { json: { ...PASS_APPLICATION(), mobile: `0${mobile}` } });
    expect(taken.status).toBe(400);
    expect((await json<ApiErrorBody>(taken)).error.fields?.mobile).toMatch(/already on another Press Pass/);
    // … and per government ID.
    const sameId = await other.req("/api/press-pass", { json: { ...PASS_APPLICATION(), idType: "pan", idNumber: application.idNumber } });
    expect(sameId.status).toBe(400);
    expect((await json<ApiErrorBody>(sameId)).error.fields?.idNumber).toMatch(/already on another Press Pass/);

    // Once issued, the pass's details are fixed (owner 2026-10-31).
    const patch = await reader.req("/api/press-pass", {
      method: "PATCH",
      json: {
        ...personal,
        mobile,
        reporterType: "citizen",
        experience: "new",
        state: "KA",
        district: "Udupi",
        city: "Manipal",
        languages: ["kn"],
        about: "Now on the sports desk.",
        links: [],
      },
    });
    expect(patch.status).toBe(409);
    expect(await code(patch)).toBe("press_pass_locked");

    // Profile shows the press chips — never the verification details.
    const profileRes = await app.request(`/api/users/${reader.username}`);
    const profileText = await profileRes.clone().text();
    const profile = await json<{ press: { level: string; stateName: string } }>(profileRes);
    expect(profile.press).toMatchObject({ level: "trainee", stateName: "Maharashtra" });
    expect(profileText).not.toContain(mobile);
    expect(profileText).not.toContain("citizen");

    const unauthenticated = await client(app).req("/api/press-pass", { json: PASS_APPLICATION() });
    expect(unauthenticated.status).toBe(401);
    const notOnboarded = await signUp(app);
    expect((await notOnboarded.req("/api/press-pass", { json: PASS_APPLICATION() })).status).toBe(403);
  });
});

describe("Review Desk", () => {
  it("Trainee stories wait in review, can be returned with a note, and 3 approvals make a Verified Reporter", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });

    const first = await submit(trainee, "Trainee story one: ward budget meeting");
    expect(first.status).toBe("in_review");
    if (first.status !== "in_review") throw new Error("expected in_review");
    expect(first.article).toMatchObject({ status: "in_review", slug: null });
    expect(first.message).toMatch(/Review Desk/);
    const id1 = first.article.id;

    // Invisible to the public, shown as "In review" to the author.
    expect(await latestIds()).not.toContain(id1);
    const owned = await json<{ article: OwnedArticle }>(await trainee.req(`/api/articles/${id1}`));
    expect(owned.article).toMatchObject({ status: "in_review", review: { state: "in_review", note: null } });
    const drafts = await json<Page<DraftCard>>(await trainee.req(`/api/users/${trainee.username}/drafts`));
    expect(drafts.items.find((d) => d.id === id1)).toMatchObject({ status: "in_review", returned: false });
    expect((await trainee.req(`/api/articles/${id1}/like`, { method: "POST" })).status).toBe(404);

    // Queue → return with a note → back to draft with feedback.
    const queue = await json<Page<AdminStoryRow>>(await desk.req("/api/admin/review?limit=50"));
    expect(queue.items.find((s) => s.id === id1)).toMatchObject({ status: "in_review", author: { id: trainee.userId, reporterLevel: "trainee", approvedCount: 0 } });
    expect(await code(await desk.req(`/api/admin/review/${id1}/return`, { json: { note: "" } }))).toBe("validation_error");
    const returned = await desk.req(`/api/admin/review/${id1}/return`, { json: { note: "Add the councillor's full quote." } });
    expect(returned.status, await returned.clone().text()).toBe(200);
    expect((await json<{ story: AdminStoryRow }>(returned)).story).toMatchObject({ status: "returned", reviewNote: "Add the councillor's full quote." });
    const afterReturn = await json<{ article: OwnedArticle }>(await trainee.req(`/api/articles/${id1}`));
    expect(afterReturn.article).toMatchObject({ status: "draft", review: { state: "returned", note: "Add the councillor's full quote." } });
    expect((await desk.req(`/api/admin/review/${id1}/approve`, { json: {} })).status).toBe(409);

    // Resubmit (clears the feedback) → approve → live.
    const cover = await coverOf(trainee);
    const resubmit = await trainee.req("/api/articles", { json: { id: id1, title: "Trainee story one: ward budget meeting", bodyHtml: LONG_BODY, cover, articleImage: cover, category: "national", ...PUBLISH_EXTRAS, action: "publish" } });
    expect((await json<SaveArticleResponse>(resubmit)).status).toBe("in_review");
    const approve = await desk.req(`/api/admin/review/${id1}/approve`, { json: {} });
    expect(approve.status, await approve.clone().text()).toBe(200);
    const approved = await json<{ story: AdminStoryRow; autoVerified: boolean }>(approve);
    expect(approved).toMatchObject({ autoVerified: false, story: { status: "published", author: { approvedCount: 1 } } });
    expect(approved.story.slug).toBeTruthy();
    expect(await latestIds()).toContain(id1);

    // Two more approvals → Verified automatically.
    for (const n of [2, 3]) {
      const story = await submit(trainee, `Trainee story ${n}: market prices this week`);
      const res = await json<{ autoVerified: boolean }>(await desk.req(`/api/admin/review/${story.article.id}/approve`, { json: { note: "Nice work" } }));
      expect(res.autoVerified).toBe(n === 3);
    }
    expect(await me(trainee)).toMatchObject({ role: "reporter", reporterLevel: "verified", pressPass: { level: "verified", approvedCount: 3 } });

    // Verified reporters publish instantly.
    const direct = await submit(trainee, "Verified now: straight to the front page");
    expect(direct.status).toBe("published");

    // Audit trail: approvals, the return and the automatic upgrade.
    const audit = await json<Page<AuditEntry>>(await desk.req(`/api/admin/audit?target=${trainee.userId}`));
    expect(audit.items.map((e) => e.action)).toContain("reporter.auto_verify");
    expect(audit.items.find((e) => e.action === "reporter.auto_verify")?.actor).toBeNull();
    const storyAudit = await json<Page<AuditEntry>>(await desk.req(`/api/admin/audit?target=${id1}`));
    expect(storyAudit.items.map((e) => e.action).sort()).toEqual(["review.approve", "review.return"]);
    expect(storyAudit.items[0]?.actor).toMatchObject({ id: desk.userId, username: desk.username });
  });

  it("withdrawing an in-review story (save as draft) takes it out of the queue", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const story = await submit(trainee, "Trainee second thoughts about this one");
    const cover = await coverOf(trainee);
    const withdraw = await trainee.req("/api/articles", { json: { id: story.article.id, title: "Second thoughts", bodyHtml: LONG_BODY, cover, action: "draft" } });
    expect((await json<SaveArticleResponse>(withdraw)).status).toBe("draft");
    const queue = await json<Page<AdminStoryRow>>(await desk.req("/api/admin/review?limit=50"));
    expect(queue.items.map((s) => s.id)).not.toContain(story.article.id);
  });
});

describe("Review Desk races", () => {
  it("an author's save or resubmit racing the approval never undoes it (and approvals count only live stories)", async () => {
    const desk = await adminUser(app);
    const trainee = await reporterUser(app, { level: "trainee" });
    const cover = await coverOf(trainee);
    let approvedAndLive = 0;
    for (let round = 0; round < 8; round++) {
      await setFixtureLevel(trainee.userId, "trainee"); // stay a Trainee however many approvals land
      const story = await submit(trainee, `Race round ${round}: ward office hours change`);
      expect(story.status).toBe("in_review");
      const action = round % 2 === 0 ? "draft" : "publish";
      const [approve, save] = await Promise.all([
        desk.req(`/api/admin/review/${story.article.id}/approve`, { json: {} }),
        trainee.req("/api/articles", { json: { id: story.article.id, title: `Race round ${round} (edited)`, bodyHtml: LONG_BODY, cover, articleImage: cover, category: "national", ...PUBLISH_EXTRAS, action } }),
      ]);
      const owned = (await json<{ article: OwnedArticle }>(await trainee.req(`/api/articles/${story.article.id}`))).article;
      if (approve.status === 200) {
        expect(owned.status).toBe("published");
        expect(owned.slug).toBeTruthy();
        if (save.status === 200) {
          // The resubmission landed first and the editor approved that version.
          expect(action).toBe("publish");
          expect(owned.title).toBe(`Race round ${round} (edited)`);
        } else {
          expect(await code(save)).toBe("already_published");
          expect(owned.title).toBe(`Race round ${round}: ward office hours change`);
        }
        approvedAndLive++;
      } else {
        expect(approve.status).toBe(409);
        expect(save.status).toBe(200);
        expect(owned.status).toBe(action === "draft" ? "draft" : "in_review");
        expect(owned.slug).toBeNull();
      }
    }
    const pass = await json<{ pressPass: PressPass }>(await trainee.req("/api/press-pass"));
    expect(pass.pressPass.approvedCount).toBe(approvedAndLive);
  });
});

describe("Editor Desk promotion (ADMIN_EMAILS)", () => {
  it("never promotes an unverified sign-up of a listed address (anyone could register it first)", async () => {
    const email = testEmail();
    adminEmails.add(email);
    try {
      const squatter = await signUp(app, email);
      expect(await me(squatter)).toMatchObject({ role: "reader" });
      expect(await code(await squatter.req("/api/admin/overview"))).toBe("admin_only");
      // Signing in again doesn't change that either.
      const again = client(app);
      expect((await again.req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(200);
      expect(await me(again)).toMatchObject({ role: "reader" });
    } finally {
      adminEmails.delete(email);
    }
  });

  it("promotes a listed address once it is verified, with an audit entry — the console still needs a finished profile", async () => {
    const desk = await adminUser(app);
    expect(await me(desk)).toMatchObject({ role: "admin" });

    const email = testEmail();
    const owner = await signUp(app, email);
    adminEmails.add(email);
    try {
      // `npm run admin:verify -- <email>` (the operator vouches for the address) promotes it straight away.
      expect(await verifyEmailAddress(email)).toEqual({ found: true, listed: true, promoted: true });
      expect(await verifyEmailAddress(email)).toEqual({ found: true, listed: true, promoted: false });
      // Promotion signs the account out everywhere: the Desk needs a typed email + password sign-in.
      expect(await me(owner)).toBeNull();
      const signedIn = await logIn(app, email, owner.userId);
      expect(await me(signedIn)).toMatchObject({ role: "admin", onboarded: false });
      expect(await code(await signedIn.req("/api/admin/overview"))).toBe("onboarding_required");
      expect(await code(await signedIn.req("/api/admin/users"))).toBe("onboarding_required");
    } finally {
      adminEmails.delete(email);
    }
    const audit = await json<Page<AuditEntry>>(await desk.req(`/api/admin/audit?target=${owner.userId}`));
    expect(audit.items.find((e) => e.action === "user.auto_admin")).toMatchObject({ actor: null, meta: { via: "ADMIN_EMAILS" } });
    expect(await verifyEmailAddress(testEmail())).toMatchObject({ found: false });
  });

  it("re-promotes a verified listed address on its next sign-in (e.g. after it was listed later)", async () => {
    const email = testEmail();
    const reader = await signUp(app, email);
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, reader.userId)); // as after Google
    adminEmails.add(email);
    try {
      const later = client(app);
      expect((await later.req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(200);
      expect(await me(later)).toMatchObject({ role: "admin" });
    } finally {
      adminEmails.delete(email);
    }
  });

  it("a verified Google sign-in claims an unverified password account registered with its address", async () => {
    const email = testEmail();
    const squatter = await signUp(app, email);
    expect(await claimUnverifiedAccount(email, false)).toBe(false); // Google hasn't verified it → nothing happens
    expect(await me(squatter)).not.toBeNull();

    expect(await claimUnverifiedAccount(email.toUpperCase(), true)).toBe(true);
    expect(await me(squatter)).toBeNull(); // every session revoked
    const [row] = await db.select({ emailVerified: userTable.emailVerified }).from(userTable).where(eq(userTable.id, squatter.userId));
    expect(row?.emailVerified).toBe(true);
    // The squatter's password is gone; Better Auth can now link Google to the account.
    expect((await client(app).req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(401);
    expect(await db.select({ id: account.id }).from(account).where(eq(account.userId, squatter.userId))).toEqual([]);
    expect(await claimUnverifiedAccount(email, true)).toBe(false); // already verified → never again
  });

  it("changes roles from the People console (reader ↔ reporter ↔ admin) but never your own", async () => {
    const desk = await adminUser(app);
    const person = await onboardedUser(app);
    const setRole = (role: string, target = person.userId) => desk.req(`/api/admin/users/${target}/role`, { json: { role } });

    expect((await json<{ user: { role: string; reporterLevel: string | null } }>(await setRole("reporter"))).user).toMatchObject({ role: "reporter", reporterLevel: "trainee" });
    const pass = await json<{ pressPass: PressPass }>(await person.req("/api/press-pass"));
    expect(pass.pressPass).toMatchObject({ passNumber: expect.stringMatching(/^WN-IN-\d{6}$/), complete: false });
    expect((await json<{ user: { role: string } }>(await setRole("admin"))).user.role).toBe("admin");
    // Becoming the Editor Desk signs them out everywhere (the Desk needs a typed email + password sign-in)…
    expect(await me(person)).toBeNull();
    const again = await logIn(app, person.user.email, person.userId);
    // …and raises the pass to Verified (badge beside the name, instant publishing).
    expect(await me(again)).toMatchObject({ role: "admin", reporterLevel: "verified" });
    expect(await json(await again.req("/api/press-pass"))).toMatchObject({ pressPass: { level: "verified" } });
    expect((await json<{ user: { role: string; reporterLevel: string | null } }>(await setRole("reader"))).user).toMatchObject({ role: "reader", reporterLevel: null });
    expect(await json(await again.req("/api/press-pass"))).toMatchObject({ pressPass: { status: "revoked" } });
    // A revoked holder can't simply re-apply…
    expect(await code(await again.req("/api/press-pass", { json: PASS_APPLICATION() }))).toBe("press_pass_revoked");
    // …but the desk can reinstate it.
    await setRole("reporter");
    expect(await me(again)).toMatchObject({ role: "reporter", pressPass: { status: "active" } });

    expect(await code(await setRole("reader", desk.userId))).toBe("cannot_modify_self");
    expect(await code(await desk.req(`/api/admin/users/${person.userId}/role`, { json: { role: "overlord" } }))).toBe("validation_error");
  });
});

describe("Editor Desk sign-in (typed email + password only)", () => {
  const HOUR = 60 * 60 * 1000;
  const tokenCookie = (res: Response) => res.headers.getSetCookie().find((cookie) => cookie.includes("session_token="));
  const latestSession = async (userId: string) => {
    const [row] = await db
      .select({ expiresAt: sessionTable.expiresAt })
      .from(sessionTable)
      .where(eq(sessionTable.userId, userId))
      .orderBy(desc(sessionTable.createdAt))
      .limit(1);
    return row;
  };

  it("an admin's sign-in is never remembered and ends after DESK_SESSION_HOURS; every login ends with the browser", async () => {
    const desk = await adminUser(app);
    const c = client(app);
    const res = await c.req("/api/auth/sign-in/email", { json: { email: desk.user.email, password: PASSWORD } });
    expect(res.status).toBe(200);
    expect(tokenCookie(res)).toBeDefined();
    expect(tokenCookie(res)).not.toMatch(/max-age|expires/i); // the cookie ends with the browser
    expect(res.headers.getSetCookie().some((cookie) => cookie.includes("dont_remember="))).toBe(true);
    expect((await latestSession(desk.userId))?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DESK_SESSION_HOURS * HOUR);
    expect(await me(c)).toMatchObject({ role: "admin" });

    // Owner rule: readers' and reporters' logins also last only until the browser closes; log out still deletes it.
    const reader = await onboardedUser(app);
    const readerClient = client(app);
    const readerRes = await readerClient.req("/api/auth/sign-in/email", { json: { email: reader.user.email, password: PASSWORD } });
    expect(tokenCookie(readerRes)).toBeDefined();
    expect(tokenCookie(readerRes)).not.toMatch(/max-age|expires/i);
    const signOut = await readerClient.req("/api/auth/sign-out", { method: "POST", json: {} });
    expect(tokenCookie(signOut)).toMatch(/max-age=0/i);
  });

  it("an admin session older than DESK_SESSION_HOURS no longer opens the Desk", async () => {
    const desk = await adminUser(app);
    expect(await me(desk)).toMatchObject({ role: "admin" });
    await db
      .update(sessionTable)
      .set({ createdAt: new Date(Date.now() - (DESK_SESSION_HOURS + 1) * HOUR) })
      .where(eq(sessionTable.userId, desk.userId));
    expect(await me(desk)).toBeNull();
    expect((await desk.req("/api/admin/overview")).status).toBe(401);
    expect(await me(await logIn(app, desk.user.email, desk.userId))).toMatchObject({ role: "admin" });
  });

  it("lets an admin in through Google (promoting a listed address) but refuses any other sign-in", async () => {
    const desk = await adminUser(app);
    const expiresAt = new Date(Date.now() + 7 * 24 * HOUR);
    const google = { path: "/callback/:id", params: { id: "google" } };
    const refused = { body: { code: "ADMIN_PASSWORD_ONLY" } };
    const viaGoogle = await beforeSessionCreate({ userId: desk.userId, expiresAt }, google);
    expect(viaGoogle!.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DESK_SESSION_HOURS * HOUR);
    await expect(beforeSessionCreate({ userId: desk.userId, expiresAt }, { path: "/callback/:id", params: { id: "facebook" } })).rejects.toMatchObject(refused);
    await expect(beforeSessionCreate({ userId: desk.userId, expiresAt }, null)).rejects.toMatchObject(refused);

    // A verified listed address coming in through Google becomes the Desk.
    const email = testEmail();
    const listed = await signUp(app, email);
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, listed.userId));
    adminEmails.add(email);
    try {
      expect(await beforeSessionCreate({ userId: listed.userId, expiresAt }, google)).toBeDefined();
      const [row] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, listed.userId));
      expect(row!.role).toBe("admin");
    } finally {
      adminEmails.delete(email);
    }
  });

  it("the People console can't make a Google-only account an admin", async () => {
    const desk = await adminUser(app);
    const person = await onboardedUser(app);
    await db.delete(account).where(and(eq(account.userId, person.userId), eq(account.providerId, "credential")));
    const res = await desk.req(`/api/admin/users/${person.userId}/role`, { json: { role: "admin" } });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("admin_needs_password");
    expect(await me(person)).toMatchObject({ role: "reader" });
  });
});

describe("Visit site: an admin browsing as a visitor", () => {
  it("`x-webnews-view-as: visitor` serves the site exactly like a logged-out visitor (and never opens the Desk)", async () => {
    const desk = await adminUser(app);
    const own = await publishArticle(desk, `Desk story seen as a visitor ${Math.random().toString(36).slice(2, 8)}`);
    const asVisitor = { headers: { "x-webnews-view-as": "visitor" } };

    expect(await me(desk)).toMatchObject({ role: "admin" });
    expect((await json<{ viewer: ViewerUser | null }>(await desk.req("/api/me", asVisitor))).viewer).toBeNull();
    const latest = await json<Page<ArticleCard>>(await desk.req("/api/feed?tab=latest&limit=30", asVisitor));
    expect(latest.items.find((item) => item.id === own.id)?.viewer).toMatchObject({ isAuthor: false, liked: false });
    expect((await desk.req("/api/admin/overview", asVisitor)).status).toBe(401);
    // Without the header the same session is the Editor Desk again.
    expect((await desk.req("/api/admin/overview")).status).toBe(200);
  });
});

describe("reporters console", () => {
  it("verifies, downgrades and revokes Press Passes", async () => {
    const desk = await adminUser(app);
    const rep = await reporterUser(app, { level: "trainee" });
    const act = (action: string) => desk.req(`/api/admin/reporters/${rep.userId}/${action}`, { json: {} });

    expect((await json<{ reporter: { pass: PressPass } }>(await act("verify"))).reporter.pass).toMatchObject({ level: "verified" });
    expect(await me(rep)).toMatchObject({ reporterLevel: "verified" });
    expect((await json<{ reporter: { pass: PressPass } }>(await act("downgrade"))).reporter.pass).toMatchObject({ level: "trainee", approvedCount: 0 });
    const revoked = await json<{ reporter: { pass: PressPass; user: { role: string } } }>(await act("revoke"));
    expect(revoked.reporter).toMatchObject({ pass: { status: "revoked" }, user: { role: "reader" } });
    expect(await code(await rep.req("/api/articles", { json: { title: "Still here?", action: "draft" } }))).toBe("press_pass_required");
    expect(await code(await act("downgrade"))).toBe("pass_revoked");
    expect((await json<{ reporter: { pass: PressPass; user: { role: string } } }>(await act("verify"))).reporter).toMatchObject({
      pass: { status: "active", level: "verified" },
      user: { role: "reporter" },
    });

    const list = await json<Page<{ user: { id: string } }>>(await desk.req(`/api/admin/reporters?q=${rep.username}`));
    expect(list.items.map((r) => r.user.id)).toEqual([rep.userId]);
    // The Editor Desk sees the verification details and can search by the mobile number as typed.
    const { pressPass: own } = await json<{ pressPass: PressPass }>(await rep.req("/api/press-pass"));
    const digits = own.mobile?.slice(3) ?? "";
    const byMobile = await json<Page<AdminReporterRow>>(await desk.req(`/api/admin/reporters?q=${encodeURIComponent(`${digits.slice(0, 5)} ${digits.slice(5)}`)}`));
    expect(byMobile.items.map((r) => r.user.id)).toEqual([rep.userId]);
    expect(byMobile.items[0]?.pass).toMatchObject({ mobile: own.mobile, reporterType: "staff", outlet: "Test Suite Times", experience: "3_5" });
    expect((await desk.req(`/api/admin/reporters/${crypto.randomUUID()}/verify`, { json: {} })).status).toBe(404);

    // Account audit labels are plain usernames — the UI shows them as handles, never with "@" (SPEC §2.2b).
    const audit = await json<Page<AuditEntry>>(await desk.req(`/api/admin/audit?target=${rep.userId}`));
    const labels = audit.items.filter((e) => e.action.startsWith("reporter.")).map((e) => e.targetLabel);
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set([rep.username]));
  });
});

describe("Verified badge level", () => {
  it("Editor Desk authors carry the Verified badge on cards, headlines, trending and user rows", async () => {
    const desk = await adminUser(app);
    const story = await publishArticle(desk, `Desk byline ${testUsername("x")}`);
    const trainee = await reporterUser(app, { level: "trainee" });
    const reader = await onboardedUser(app);

    const detail = await json<{ article: ArticleCard }>(await reader.req(`/api/articles/by-slug/${story.slug}`));
    expect(detail.article.badges?.reporterLevel).toBe("verified");
    const latest = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=latest&limit=30"));
    expect(latest.items.find((i) => i.id === story.id)?.badges?.reporterLevel).toBe("verified");
    const headlines = await json<{ items: Headline[] }>(await app.request("/api/feed/headlines?limit=30"));
    expect(headlines.items.find((h) => h.id === story.id)?.author).toEqual({ username: desk.username, reporterLevel: "verified" });
    const trending = await json<{ items: TrendingHeadline[] }>(await app.request("/api/feed/trending?limit=20"));
    for (const item of trending.items) expect(item.author).toHaveProperty("reporterLevel");

    expect((await reader.req(`/api/users/${desk.username}/follow`, { method: "POST" })).status).toBe(200);
    expect((await reader.req(`/api/users/${trainee.username}/follow`, { method: "POST" })).status).toBe(200);
    const following = await json<Page<UserRow>>(await reader.req(`/api/users/${reader.username}/following`));
    const levelOf = (id: string) => following.items.find((row) => row.id === id)?.reporterLevel;
    expect(levelOf(desk.userId)).toBe("verified");
    expect(levelOf(trainee.userId)).toBe("trainee");
    const followers = await json<Page<UserRow>>(await reader.req(`/api/users/${desk.username}/followers`));
    expect(followers.items.find((row) => row.id === reader.userId)?.reporterLevel).toBeNull();
  });
});

describe("hidden stories and suspended reporters", () => {
  it("hidden stories vanish from every public surface but stay visible to their author", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const story = await publishArticle(author, "A story the desk will hide");

    const hide = await desk.req(`/api/admin/stories/${story.id}/hide`, { json: { reason: "Unverified claims" } });
    expect(hide.status, await hide.clone().text()).toBe(200);
    expect((await json<{ story: AdminStoryRow }>(hide)).story).toMatchObject({ status: "hidden", hiddenReason: "Unverified claims" });

    expect(await latestIds(reader)).not.toContain(story.id);
    const forYou = await json<Page<ArticleCard>>(await reader.req("/api/feed?tab=foryou&limit=30"));
    expect(forYou.items.map((i) => i.id)).not.toContain(story.id);
    const headlines = await json<{ items: Array<{ id: string }> }>(await app.request("/api/feed/headlines?limit=30"));
    expect(headlines.items.map((h) => h.id)).not.toContain(story.id);
    const trending = await json<{ items: Array<{ id: string }> }>(await app.request("/api/feed/trending?limit=20"));
    expect(trending.items.map((h) => h.id)).not.toContain(story.id);
    expect((await reader.req(`/api/articles/by-slug/${story.slug}`)).status).toBe(404);
    expect((await reader.req(`/api/articles/${story.id}/like`, { method: "POST" })).status).toBe(404);
    expect((await reader.req(`/api/articles/${story.id}/save`, { method: "POST" })).status).toBe(404);
    const othersGrid = await json<Page<ArticleCard>>(await reader.req(`/api/users/${author.username}/articles`));
    expect(othersGrid.items.map((i) => i.id)).not.toContain(story.id);

    // The author (and the desk) still see it, flagged hidden.
    const ownGrid = await json<Page<ArticleCard>>(await author.req(`/api/users/${author.username}/articles`));
    expect(ownGrid.items.find((i) => i.id === story.id)).toMatchObject({ hidden: true });
    const ownPage = await author.req(`/api/articles/by-slug/${story.slug}`);
    expect(ownPage.status).toBe(200);
    expect((await json<{ article: ArticleCard }>(ownPage)).article.hidden).toBe(true);
    expect((await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${story.id}`))).article.hidden).toMatchObject({ reason: "Unverified claims" });
    expect((await desk.req(`/api/articles/by-slug/${story.slug}`)).status).toBe(200);

    await desk.req(`/api/admin/stories/${story.id}/unhide`, { method: "POST" });
    expect(await latestIds(reader)).toContain(story.id);

    // Unpublish → back to the author's drafts as "returned".
    const unpublish = await desk.req(`/api/admin/stories/${story.id}/unpublish`, { json: { reason: "Needs a second source" } });
    expect((await json<{ story: AdminStoryRow }>(unpublish)).story).toMatchObject({ status: "returned", slug: null, reviewNote: "Needs a second source" });
    expect(await latestIds(reader)).not.toContain(story.id);
    expect((await json<{ article: OwnedArticle }>(await author.req(`/api/articles/${story.id}`))).article).toMatchObject({
      status: "draft",
      review: { state: "returned", note: "Needs a second source" },
    });

    // Delete (desk) → gone.
    const other = await publishArticle(author, "A story the desk will delete");
    expect((await desk.req(`/api/admin/stories/${other.id}?reason=duplicate`, { method: "DELETE" })).status).toBe(204);
    expect((await author.req(`/api/articles/${other.id}`)).status).toBe(404);
    const audit = await json<Page<AuditEntry>>(await desk.req(`/api/admin/audit?target=${story.id}`));
    expect(audit.items.map((e) => e.action).sort()).toEqual(["story.hide", "story.unhide", "story.unpublish"]);
  });

  it("suspension revokes sessions, blocks sign-in with a clear code, and hides the reporter's content", async () => {
    const desk = await adminUser(app);
    const email = testEmail();
    const rep = await signUp(app, email);
    const username = testUsername();
    await onboard(rep, username);
    await applyPressPass(rep);
    const reader = await onboardedUser(app);
    // Trainee stories can't be seen anyway; make this one Verified through the console.
    await desk.req(`/api/admin/reporters/${rep.userId}/verify`, { json: {} });
    const story = await publishArticle(rep, "Story by a soon-suspended reporter");
    expect(await latestIds(reader)).toContain(story.id);

    const suspend = await desk.req(`/api/admin/users/${rep.userId}/suspend`, { json: { reason: "Repeated fake news" } });
    expect(suspend.status, await suspend.clone().text()).toBe(200);
    expect((await json<{ user: { suspended: boolean; suspendReason: string } }>(suspend)).user).toMatchObject({ suspended: true, suspendReason: "Repeated fake news" });

    // Session gone; sign-in refused with ACCOUNT_SUSPENDED.
    expect(await me(rep)).toBeNull();
    const signIn = await client(app).req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
    expect(signIn.status).toBe(403);
    const body = await json<{ code: string; message: string }>(signIn);
    expect(body.code).toBe("ACCOUNT_SUSPENDED");
    expect(body.message).toMatch(/suspended/i);

    // Content hidden everywhere public; profile 404 (except for the desk).
    expect(await latestIds(reader)).not.toContain(story.id);
    expect((await reader.req(`/api/articles/by-slug/${story.slug}`)).status).toBe(404);
    expect((await reader.req(`/api/users/${username}`)).status).toBe(404);
    expect((await desk.req(`/api/users/${username}`)).status).toBe(200);
    const people = await json<Page<{ id: string }>>(await desk.req("/api/admin/users?status=suspended&limit=50"));
    expect(people.items.map((u) => u.id)).toContain(rep.userId);

    // Admins can't be suspended, nor can you suspend yourself.
    const otherDesk = await adminUser(app);
    expect(await code(await desk.req(`/api/admin/users/${otherDesk.userId}/suspend`, { json: { reason: "no" } }))).toBe("cannot_suspend_admin");
    expect(await code(await desk.req(`/api/admin/users/${desk.userId}/suspend`, { json: { reason: "no" } }))).toBe("cannot_modify_self");

    await desk.req(`/api/admin/users/${rep.userId}/unsuspend`, { method: "POST" });
    const back = client(app);
    expect((await back.req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(200);
    expect(await latestIds(reader)).toContain(story.id);
  });
});

describe("saves and flags", () => {
  it("Save for later: idempotent, listed newest first, flagged on cards, gone when hidden", async () => {
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const a = await publishArticle(author, "First story to save for later");
    const b = await publishArticle(author, "Second story to save for later");

    expect((await client(app).req(`/api/articles/${a.id}/save`, { method: "POST" })).status).toBe(401);
    for (const id of [a.id, b.id, b.id]) {
      expect(await json(await reader.req(`/api/articles/${id}/save`, { method: "POST" }))).toEqual({ saved: true, articleId: id });
    }
    const saved = await json<Page<ArticleCard>>(await reader.req("/api/me/saved"));
    expect(saved.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(saved.items.every((i) => i.viewer.saved)).toBe(true);
    const card = (await json<{ article: ArticleCard }>(await reader.req(`/api/articles/by-slug/${a.slug}`))).article;
    expect(card.viewer.saved).toBe(true);

    expect(await json(await reader.req(`/api/articles/${a.id}/save`, { method: "DELETE" }))).toEqual({ saved: false, articleId: a.id });
    expect((await json<Page<ArticleCard>>(await reader.req("/api/me/saved"))).items.map((i) => i.id)).toEqual([b.id]);

    const desk = await adminUser(app);
    await desk.req(`/api/admin/stories/${b.id}/hide`, { json: { reason: "test" } });
    expect((await json<Page<ArticleCard>>(await reader.req("/api/me/saved"))).items).toEqual([]);
    expect((await client(app).req("/api/me/saved")).status).toBe(401);
  });

  it("one open flag per reader per story; the desk resolves them per story", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const readers = [await onboardedUser(app), await onboardedUser(app)];
    const story = await publishArticle(author, "A contested story that readers report");

    expect(await code(await author.req(`/api/articles/${story.id}/flag`, { json: { reason: "spam" } }))).toBe("cannot_flag_own");
    expect(await code(await readers[0]!.req(`/api/articles/${story.id}/flag`, { json: { reason: "rumour" } }))).toBe("validation_error");
    expect((await readers[0]!.req(`/api/articles/${story.id}/flag`, { json: { reason: "misinformation", note: "The date is wrong" } })).status).toBe(201);
    const twice = await readers[0]!.req(`/api/articles/${story.id}/flag`, { json: { reason: "spam" } });
    expect(twice.status).toBe(409);
    expect(await code(twice)).toBe("already_flagged");
    expect((await readers[1]!.req(`/api/articles/${story.id}/flag`, { json: { reason: "misinformation" } })).status).toBe(201);
    expect((await client(app).req(`/api/articles/${story.id}/flag`, { json: { reason: "spam" } })).status).toBe(401);

    const open = await json<Page<{ article: { id: string }; openCount: number; reasons: Record<string, number>; flags: Array<{ note: string | null }> }>>(
      await desk.req("/api/admin/flags?status=open&limit=50"),
    );
    const group = open.items.find((g) => g.article.id === story.id);
    expect(group).toMatchObject({ openCount: 2, reasons: { misinformation: 2 } });
    expect(group?.flags.map((f) => f.note)).toContain("The date is wrong");

    const resolve = await desk.req(`/api/admin/flags/${story.id}/resolve`, { json: { action: "dismiss" } });
    expect(await json(resolve)).toEqual({ resolved: 2, resolution: "dismissed" });
    const stillOpen = await json<Page<{ article: { id: string } }>>(await desk.req("/api/admin/flags?status=open&limit=50"));
    expect(stillOpen.items.map((g) => g.article.id)).not.toContain(story.id);
    // Resolved → the same reader may report again; "hide" resolution hides the story.
    expect((await readers[0]!.req(`/api/articles/${story.id}/flag`, { json: { reason: "hate" } })).status).toBe(201);
    expect(await json(await desk.req(`/api/admin/flags/${story.id}/resolve`, { json: { action: "hide", note: "Hate speech in the quotes" } }))).toEqual({
      resolved: 1,
      resolution: "hidden",
    });
    const detail = await json<{ story: AdminStoryRow; flags: unknown[] }>(await desk.req(`/api/admin/stories/${story.id}`));
    expect(detail.story).toMatchObject({ status: "hidden", hiddenReason: "Hate speech in the quotes", openFlags: 0 });
    expect(detail.flags).toHaveLength(3);
  });

  it("warning a reporter (or hiding their story) reaches them as a notice they can acknowledge", async () => {
    const desk = await adminUser(app);
    const author = await reporterUser(app);
    const reader = await onboardedUser(app);
    const story = await publishArticle(author, `Notice story ${Math.random().toString(36).slice(2, 8)}`);
    const notices = async () => json<NoticesResponse>(await author.req("/api/me/notices"));

    expect(await notices()).toEqual({ items: [], unread: 0 });
    expect((await reader.req(`/api/articles/${story.id}/flag`, { json: { reason: "misinformation" } })).status).toBe(201);
    const warn = await desk.req(`/api/admin/flags/${story.id}/resolve`, { json: { action: "warn", note: "Check your sources before publishing." } });
    expect(await json(warn)).toEqual({ resolved: 1, resolution: "warned" });

    const afterWarn = await notices();
    // Two warnings: the reader's report warns the author at once (owner 2026-09-30), then the Desk's own, newest first.
    expect(afterWarn.unread).toBe(2);
    expect(afterWarn.items[0]).toMatchObject({
      kind: "warning",
      message: "Check your sources before publishing.",
      story: { id: story.id, slug: story.slug, title: story.title },
      read: false,
    });
    expect(await me(author)).toMatchObject({ unreadNotices: 2 });

    // Hiding the story tells them too (its link stays: the author can still open their hidden story).
    expect((await desk.req(`/api/admin/stories/${story.id}/hide`, { json: { reason: "Unverified claims" } })).status).toBe(200);
    const afterHide = await notices();
    expect(afterHide.unread).toBe(3);
    expect(afterHide.items[0]).toMatchObject({ kind: "story_hidden", message: "Unverified claims", story: { slug: story.slug, title: story.title } });

    // "Got it" marks one read; no ids marks the rest. Nobody else can see them.
    expect(await json(await author.req("/api/me/notices/read", { json: { ids: [afterHide.items[0]!.id] } }))).toEqual({ unread: 2 });
    expect(await json(await author.req("/api/me/notices/read", { json: {} }))).toEqual({ unread: 0 });
    expect(await me(author)).toMatchObject({ unreadNotices: 0 });
    expect(await json(await reader.req("/api/me/notices"))).toEqual({ items: [], unread: 0 });
    expect((await client(app).req("/api/me/notices")).status).toBe(401);
  });
});
