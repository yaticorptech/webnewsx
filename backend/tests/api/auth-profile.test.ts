import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, sql } from "../../src/db/client.js";
import type { ApiErrorBody, UploadedImage, UsernameCheck, ViewerUser } from "../../src/shared/contracts.js";
import { TERMS_VERSION } from "../../src/shared/contracts.js";
import {
  ORIGIN,
  PASSWORD,
  cleanupFixtures,
  client,
  freshApp,
  json,
  onboard,
  onboardedUser,
  randomLetters,
  reporterUser,
  signUp,
  testEmail,
  testUsername,
  trackUser,
  upload,
} from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const check = async (u: string, c = client(app)) => json<UsernameCheck>(await c.req(`/api/username/check?u=${encodeURIComponent(u)}`));

describe("health", () => {
  it("reports db ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: true });
  });
});

describe("sign-up → /api/me", () => {
  it("returns viewer null when signed out", async () => {
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: null });
  });

  it("accepts name '' on sign-up and exposes a not-yet-onboarded viewer", async () => {
    const local = `Fresh.${randomLetters(8)}`;
    const c = await signUp(app, testEmail(local).replace("test.webnews.local", "Test.WebNEWS.local"));
    const { viewer } = await json<{ viewer: ViewerUser }>(await c.req("/api/me"));
    expect(viewer).toMatchObject({ email: testEmail(local.toLowerCase()), name: "", username: null, image: null, bio: null, onboarded: false });
    expect(viewer.id).toBe(c.userId);
  });

  it("accepts email + password only (no name) and ignores a client-supplied image", async () => {
    const c = await signUp(app, testEmail(), { image: "https://evil.test/tracker.png" });
    const { viewer } = await json<{ viewer: ViewerUser }>(await c.req("/api/me"));
    expect(viewer).toMatchObject({ name: "", image: null, onboarded: false });
  });

  it("only takes JSON sign-ups (a form body can't smuggle a name or photo past the normalizer)", async () => {
    const c = client(app);
    const body = new URLSearchParams({ email: testEmail(), password: PASSWORD, name: "x".repeat(5000), image: "https://evil.test/p.gif" });
    const res = await c.req("/api/auth/sign-up/email", { body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.status).toBe(415);
    expect((await json<ApiErrorBody>(res)).error.code).toBe("unsupported_media_type");
    const upper = await c.req("/api/auth/sign-up/email", {
      body: JSON.stringify({ email: testEmail(), password: PASSWORD, name: "y".repeat(500), image: "https://evil.test/q.gif" }),
      headers: { "content-type": "Application/JSON; charset=utf-8" },
    });
    expect(upper.status, await upper.clone().text()).toBe(200);
    const created = await json<{ user: { id: string } }>(upper);
    trackUser(created.user.id);
    const { viewer } = await json<{ viewer: ViewerUser }>(await c.req("/api/me"));
    expect(viewer.name).toHaveLength(50);
    expect(viewer.image).toBeNull();
  });

  it("disables Better Auth's /update-user (profile edits go through PATCH /api/me with its rules)", async () => {
    const me = await onboardedUser(app);
    const before = await json<{ viewer: ViewerUser }>(await me.req("/api/me"));
    const res = await me.req("/api/auth/update-user", { json: { name: "z".repeat(200_000), image: "https://attacker.example/pixel.gif" } });
    expect(res.status).toBe(404);
    const after = await json<{ viewer: ViewerUser }>(await me.req("/api/me"));
    expect(after.viewer).toMatchObject({ name: before.viewer.name, image: before.viewer.image });
  });

  it("enforces the 8-char password minimum", async () => {
    const res = await client(app).req("/api/auth/sign-up/email", { json: { email: testEmail(), password: "1234567", name: "" } });
    expect(res.status).toBe(400);
  });

  it("only creates an account with a password rated at least Good", async () => {
    const signUpWith = async (password: string, email = testEmail()) => {
      const res = await client(app).req("/api/auth/sign-up/email", { json: { email, password, name: "" } });
      const body = await json<{ code?: string; user?: { id: string } }>(res);
      if (body.user) trackUser(body.user.id);
      return { status: res.status, body };
    };
    // Weak: one kind of character, common words, runs, or your own email name.
    for (const weak of ["abcdefgh", "12345678", "Password123!", "qwerty!!99A", "aaaaaaaaaaaa", "harbour2026"]) {
      expect(await signUpWith(weak), weak).toMatchObject({ status: 400, body: { code: "WEAK_PASSWORD" } });
    }
    const email = testEmail(`lakshmi${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 5)}`);
    expect(await signUpWith(`${email.split("@")[0]}#X9`, email)).toMatchObject({ status: 400, body: { code: "WEAK_PASSWORD" } });
    // Good: 3 kinds of characters, or a long passphrase.
    expect((await signUpWith("Harbour-lights7")).status).toBe(200);
    expect((await signUpWith("tidal clock keeps perfect time")).status).toBe(200);
  });

  it("rejects non-onboarded users on mutations", async () => {
    const c = await signUp(app);
    const res = await c.req("/api/articles", { json: { title: "x", action: "draft" } });
    expect(res.status).toBe(403);
    expect((await json<ApiErrorBody>(res)).error.code).toBe("onboarding_required");
  });

  it("signs in again with email + password and signs out", async () => {
    const email = testEmail();
    await signUp(app, email);
    const c = client(app);
    const res = await c.req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
    expect(res.status).toBe(200);
    expect((await json<{ viewer: ViewerUser | null }>(await c.req("/api/me"))).viewer?.email).toBe(email);

    expect((await c.req("/api/auth/sign-out", { method: "POST", json: {} })).status).toBe(200);
    expect((await json<{ viewer: ViewerUser | null }>(await c.req("/api/me"))).viewer).toBeNull();
  });

  it("offers Google sign-in with the frontend callback URL", async () => {
    const res = await client(app).req("/api/auth/sign-in/social", { json: { provider: "google", callbackURL: "/" } });
    if (res.status === 404 || res.status === 400) {
      // Google credentials not configured on this machine: nothing else to check.
      expect((await res.text()).length).toBeGreaterThan(0);
      return;
    }
    expect(res.status).toBe(200);
    const { url } = await json<{ url: string }>(res);
    const target = new URL(url);
    expect(target.hostname).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
  });
});

describe("GET /api/username/check", () => {
  it("reports available / taken / reserved / invalid (format → reserved → taken)", async () => {
    const owner = await onboardedUser(app);

    const free = testUsername("free");
    expect(await check(free)).toEqual({ available: true, message: "Username is available", suggestions: [] });

    const taken = await check(owner.username.toUpperCase());
    expect(taken).toMatchObject({ available: false, reason: "taken", code: "taken", message: "Username is not available" });
    expect(taken.suggestions.length).toBeGreaterThan(0);
    expect(taken.suggestions.length).toBeLessThanOrEqual(3);
    for (const s of taken.suggestions) expect(s).toMatch(/^[a-z]+(\.[a-z]+)*$/);

    const reserved = await check("admin");
    expect(reserved).toMatchObject({ available: false, reason: "reserved", code: "reserved", message: "Username is not available" });
    expect(reserved.suggestions.length).toBe(3);
    for (const s of reserved.suggestions) expect(s).toMatch(/^[a-z]+(\.[a-z]+)*$/);

    expect(await check("bad_name")).toEqual({ available: false, reason: "invalid", code: "invalid_chars", message: "Only letters and dots allowed", suggestions: [] });
    expect(await check("abc2")).toMatchObject({ reason: "invalid", code: "invalid_chars" });
    expect(await check("a..b")).toMatchObject({ reason: "invalid", code: "double_dot", message: "No consecutive dots" });
    expect(await check(".abc")).toMatchObject({ reason: "invalid", code: "leading_dot", message: "Can't start with a dot" });
    expect(await check("abc.")).toMatchObject({ reason: "invalid", code: "trailing_dot", message: "Can't end with a dot" });
    expect(await check("ab")).toMatchObject({ reason: "invalid", code: "too_short" });
    expect(await check("a".repeat(31))).toMatchObject({ reason: "invalid", code: "too_long" });
    expect(await check("")).toMatchObject({ available: false, reason: "invalid" });
  });

  it("never suggests a taken username", async () => {
    // New usernames need a dot (owner 2026-10-15): "<9 letters>.ab" is the taken one.
    const stem = randomLetters(9);
    const taken = `${stem}.ab`;
    await onboardedUser(app, taken);
    await onboardedUser(app, `${stem}.news`);
    const res = await check(taken);
    expect(res.available).toBe(false);
    expect(res.suggestions).not.toContain(`${stem}.news`);
    expect(res.suggestions).not.toContain(taken);
    for (const s of res.suggestions) expect((await check(s)).available).toBe(true);
  });

  it("treats your own username as available", async () => {
    const me = await onboardedUser(app);
    expect((await check(me.username, me)).available).toBe(true);
    expect((await check(me.username)).available).toBe(false);
  });

  it("rate limits at 30/min per IP", async () => {
    const c = client(app);
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await c.req(`/api/username/check?u=${testUsername()}`)).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/upload", () => {
  it("re-encodes an avatar to 512×512 webp with a blur placeholder, served from /media", async () => {
    const c = await signUp(app);
    const res = await upload(c, "avatar");
    expect(res.status).toBe(201);
    const body = await json<UploadedImage>(res);
    expect(body.width).toBe(512);
    expect(body.height).toBe(512);
    expect(body.key).toMatch(new RegExp(`^avatars/${c.userId}/[0-9a-f-]{36}\\.webp$`));
    expect(body.url).toBe(`/media/${body.key}`);
    expect(body.blurDataUrl).toMatch(/^data:image\/webp;base64,/);

    const media = await app.request(body.url);
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/webp");
    expect(media.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("limits covers to 1600px wide webp", async () => {
    const c = await reporterUser(app);
    const sharp = (await import("sharp")).default;
    const big = await sharp({ create: { width: 2400, height: 1350, channels: 3, background: "#111" } }).jpeg().toBuffer();
    const res = await upload(c, "cover", big, "big.jpg", "image/jpeg");
    expect(res.status).toBe(201);
    expect(await json<UploadedImage>(res)).toMatchObject({ width: 1600, height: 900 });
  });

  it("caps cover height too and refuses extreme aspect ratios and huge inputs (CPU/storage traps)", async () => {
    const c = await reporterUser(app);
    const sharp = (await import("sharp")).default;
    const tall = await sharp({ create: { width: 1200, height: 2400, channels: 3, background: "#222" } }).png().toBuffer();
    const res = await upload(c, "cover", tall, "tall.png");
    expect(res.status).toBe(201);
    expect(await json<UploadedImage>(res)).toMatchObject({ width: 800, height: 1600 });

    const strip = await sharp({ create: { width: 400, height: 4000, channels: 3, background: "#333" } }).png().toBuffer();
    const stripRes = await upload(c, "cover", strip, "strip.png");
    expect(stripRes.status).toBe(422);
    expect((await json<ApiErrorBody>(stripRes)).error.code).toBe("image_aspect_ratio");

    const huge = await sharp({ create: { width: 7000, height: 4000, channels: 3, background: "#444" } }).png({ compressionLevel: 9 }).toBuffer();
    const hugeRes = await upload(c, "cover", huge, "huge.png");
    expect(hugeRes.status).toBe(415);
  });

  it("rejects non-images regardless of the declared mime type", async () => {
    const c = await signUp(app);
    const res = await upload(c, "avatar", Buffer.from("<html>definitely not a png</html>"), "evil.png", "image/png");
    expect(res.status).toBe(415);
    expect((await json<ApiErrorBody>(res)).error.code).toBe("unsupported_image");
  });

  it("requires onboarding for covers and login for everything", async () => {
    const c = await signUp(app);
    expect((await upload(c, "cover")).status).toBe(403);
    expect((await upload(client(app), "avatar")).status).toBe(401);
  });

  it("blocks path traversal on /media", async () => {
    for (const path of ["/media/..%2F..%2Fpackage.json", "/media/avatars/../../.env", "/media/avatars/x/%2e%2e%2f.env", "/media/.env"]) {
      expect((await app.request(path)).status).toBe(404);
    }
  });
});

describe("POST /api/onboarding", () => {
  it("validates every required field", async () => {
    const c = await signUp(app);
    const res = await c.req("/api/onboarding", { json: { username: "a_b", name: "", bio: "", image: "", acceptTerms: false } });
    expect(res.status).toBe(400);
    const { error } = await json<ApiErrorBody>(res);
    expect(error.code).toBe("validation_error");
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(["acceptTerms", "bio", "image", "name", "username"]);
    expect(error.fields?.username).toBe("Only letters and dots allowed");
  });

  it("rejects reserved usernames", async () => {
    const c = await signUp(app);
    const avatar = await json<UploadedImage>(await upload(c, "avatar"));
    const res = await c.req("/api/onboarding", { json: { username: "settings", name: "S", bio: "B", image: avatar.url, acceptTerms: true } });
    expect(res.status).toBe(400);
    expect((await json<ApiErrorBody>(res)).error.fields?.username).toBe("Username is not available");
  });

  it("completes the profile and stores terms acceptance", async () => {
    const c = await signUp(app);
    const username = testUsername("on");
    const user = await onboard(c, username, "On Board");
    expect(user).toMatchObject({ username, name: "On Board", onboarded: true, bio: "Reporting from the test suite." });
    expect(user.image).toMatch(new RegExp(`^/media/avatars/${c.userId}/`));
    const [row] = await sql`select terms_version, terms_accepted_at, onboarded_at from "user" where id = ${user.id}`;
    expect(row?.terms_version).toBe(TERMS_VERSION);
    expect(Number.isNaN(new Date(String(row?.terms_accepted_at)).getTime())).toBe(false);
    expect(row?.onboarded_at).toBeTruthy();

    expect((await json<{ viewer: ViewerUser }>(await c.req("/api/me"))).viewer.onboarded).toBe(true);
    const again = await c.req("/api/onboarding", { json: { username, name: "x", bio: "y", image: user.image, acceptTerms: true } });
    expect(again.status).toBe(409);
  });

  it("returns 409 username_taken for a taken username", async () => {
    const first = await onboardedUser(app);
    const c = await signUp(app);
    const avatar = await json<UploadedImage>(await upload(c, "avatar"));
    const res = await c.req("/api/onboarding", {
      json: { username: first.username.toUpperCase(), name: "Second", bio: "Bio", image: avatar.url, acceptTerms: true },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "username_taken", message: "Username is not available" } });
  });

  it("refuses images that aren't the user's own upload or a Google photo", async () => {
    const other = await signUp(app);
    const foreign = await json<UploadedImage>(await upload(other, "avatar"));
    const c = await signUp(app);
    for (const image of [foreign.url, "https://evil.test/a.png", "javascript:alert(1)", "https://googleusercontent.com.evil.test/a.png"]) {
      const res = await c.req("/api/onboarding", { json: { username: testUsername(), name: "T", bio: "B", image, acceptTerms: true } });
      expect(res.status).toBe(400);
      expect((await json<ApiErrorBody>(res)).error.fields?.image).toBeTruthy();
    }
  });
});

describe("PATCH /api/me", () => {
  it("updates profile fields and checks username uniqueness", async () => {
    const occupied = await onboardedUser(app);
    const me = await onboardedUser(app);
    const renamed = testUsername("desk");
    const ok = await me.req("/api/me", { method: "PATCH", json: { name: "New Name", bio: "Line one\nLine two", username: renamed } });
    expect(ok.status).toBe(200);
    expect((await json<{ user: ViewerUser }>(ok)).user).toMatchObject({ name: "New Name", bio: "Line one\nLine two", username: renamed });

    const clash = await me.req("/api/me", { method: "PATCH", json: { username: occupied.username } });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ error: { code: "username_taken", message: "Username is not available" } });

    const invalid = await me.req("/api/me", { method: "PATCH", json: { username: "no_underscores" } });
    expect(invalid.status).toBe(400);
    expect((await json<ApiErrorBody>(invalid)).error.fields?.username).toBe("Only letters and dots allowed");

    const avatar = await json<UploadedImage>(await upload(me, "avatar"));
    const photo = await me.req("/api/me", { method: "PATCH", json: { image: avatar.url } });
    expect((await json<{ user: ViewerUser }>(photo)).user.image).toBe(avatar.url);
  });

  it("requires an onboarded session", async () => {
    expect((await client(app).req("/api/me", { method: "PATCH", json: { name: "x" } })).status).toBe(401);
    const fresh = await signUp(app);
    expect((await fresh.req("/api/me", { method: "PATCH", json: { name: "x" } })).status).toBe(403);
  });

  it("blocks cross-site requests by Origin", async () => {
    const me = await onboardedUser(app);
    const res = await me.req("/api/me", { method: "PATCH", json: { name: "Pwned" }, headers: { origin: "https://evil.test" } });
    expect(res.status).toBe(403);
  });
});
