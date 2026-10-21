import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { expect } from "vitest";
import { createApp, type App } from "../src/app.js";
import { db } from "../src/db/client.js";
import { TEST_EMAIL_DOMAIN, purgeUsers } from "../src/db/purge.js";
import { pressPass, user as userTable } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { verifyEmailAddress } from "../src/lib/admin-emails.js";
import { adminEmails } from "../src/lib/roles.js";
import type {
  ArticleDetail,
  PressPass,
  PressPassApplyInput,
  ReporterLevel,
  SaveArticleInput,
  SaveArticleResponse,
  UploadedImage,
  ViewerUser,
} from "../src/shared/contracts.js";

/*
 * Non-destructive fixtures: tests share the real database (webnews_platform) with demo content and
 * real accounts. Every user created here gets a random "@test.webnews.local" email and a random
 * letters-and-dots username, is tracked, and is deleted (FK cascade) by cleanupFixtures() in afterAll.
 * Assertions never depend on "the database only contains my rows".
 */

export const ORIGIN = env.FRONTEND_URL;
export const PASSWORD = "correct-horse-battery";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function randomLetters(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += LETTERS[randomInt(LETTERS.length)];
  return out;
}

/** Unique username made of letters and dots only, e.g. "t.qxkzvbma". */
export function testUsername(prefix = "t"): string {
  return `${prefix}.${randomLetters(8)}`;
}

/** Random 10-digit Indian mobile number (Press Pass verification; one pass per number). */
export function testMobile(): string {
  return `6${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
}

/** Unique fixture PAN (`ABCDE1234F` shape): one Press Pass per ID. */
export function testPan(): string {
  return `${randomLetters(5).toUpperCase()}${String(randomInt(10_000)).padStart(4, "0")}${randomLetters(1).toUpperCase()}`;
}

/** Unique fixture email in the test domain. */
export function testEmail(local = randomLetters(12)): string {
  return `${local}@${TEST_EMAIL_DOMAIN}`;
}

const createdUserIds = new Set<string>();

export function trackUser(id: string): void {
  createdUserIds.add(id);
}

/** Deletes exactly the users this test file created (and everything they own). */
export async function cleanupFixtures(): Promise<void> {
  const ids = [...createdUserIds];
  createdUserIds.clear();
  forgetFixtureAdmins();
  await purgeUsers({ ids });
}

let ipCounter = randomInt(1, 60_000);
/** A unique client IP per simulated user (keeps Better Auth's per-IP sign-up limit out of the way). */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

type RequestInitLite = { method?: string; json?: unknown; body?: RequestInit["body"]; headers?: Record<string, string> };

export type Client = {
  app: App;
  ip: string;
  cookie: string;
  /** Cookie-carrying request helper with sane defaults (JSON body, Origin = FRONTEND_URL). */
  req: (path: string, init?: RequestInitLite) => Promise<Response>;
};

export function client(app: App, cookie = "", ip = nextIp()): Client {
  const c: Client = {
    app,
    ip,
    cookie,
    req: async (path, init = {}) => {
      const headers: Record<string, string> = { origin: ORIGIN, "x-forwarded-for": c.ip, ...init.headers };
      if (c.cookie) headers.cookie = c.cookie;
      let body = init.body;
      if (init.json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(init.json);
      }
      const res = await app.request(path, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
      mergeCookies(c, res);
      return res;
    },
  };
  return c;
}

/** Keeps a tiny cookie jar in `client.cookie` from Set-Cookie headers. */
function mergeCookies(c: Client, res: Response): void {
  const jar = new Map(
    c.cookie
      .split(/;\s*/)
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return [pair.slice(0, i), pair.slice(i + 1)] as [string, string];
      }),
  );
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    if (!pair) continue;
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (/max-age=0/i.test(header) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
  c.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Removes this file's fixture emails from ADMIN_EMAILS again (call in afterAll when using adminUser). */
const fixtureAdminEmails = new Set<string>();
export function forgetFixtureAdmins(): void {
  for (const email of fixtureAdminEmails) adminEmails.delete(email);
  fixtureAdminEmails.clear();
}

/** Signs up with email + password (name "" like the real UI) and returns a logged-in, tracked client. */
export async function signUp(app: App, email = testEmail(), body: Record<string, unknown> = { name: "" }): Promise<Client & { userId: string }> {
  const c = client(app);
  const res = await c.req("/api/auth/sign-up/email", { json: { email, password: PASSWORD, ...body } });
  expect(res.status, await res.clone().text()).toBe(200);
  const { user } = await json<{ user: { id: string } }>(res);
  trackUser(user.id);
  expect(c.cookie).toContain("session_token");
  return Object.assign(c, { userId: user.id });
}

let pngCache: Buffer | null = null;
export async function samplePng(): Promise<Buffer> {
  pngCache ??= await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#E93629" } })
    .composite([{ input: Buffer.from('<svg width="1200" height="800"><rect x="100" y="100" width="400" height="300" fill="#000"/></svg>'), top: 0, left: 0 }])
    .png()
    .toBuffer();
  return pngCache;
}

export async function upload(c: Client, kind: "avatar" | "cover", bytes?: Buffer, filename = "image.png", type = "image/png"): Promise<Response> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new File([new Uint8Array(bytes ?? (await samplePng()))], filename, { type }));
  return c.req("/api/upload", { method: "POST", body: form });
}

export async function onboard(c: Client, username: string, name = "Test Publisher"): Promise<ViewerUser> {
  const up = await upload(c, "avatar");
  expect(up.status).toBe(201);
  const avatar = await json<UploadedImage>(up);
  const res = await c.req("/api/onboarding", {
    json: { username, name, bio: "Reporting from the test suite.", image: avatar.url, acceptTerms: true },
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await json<{ user: ViewerUser }>(res)).user;
}

export type OnboardedClient = Client & { userId: string; user: ViewerUser; username: string };

/** A signed-up + onboarded fixture user with a random letters-and-dots username. */
export async function onboardedUser(app: App, username = testUsername()): Promise<OnboardedClient> {
  const c = await signUp(app);
  const user = await onboard(c, username);
  return Object.assign(c, { user, username });
}

export const PASS_APPLICATION = (name = "Test Publisher"): PressPassApplyInput => ({
  legalName: name,
  dateOfBirth: "1990-04-15",
  address: "12, 4th Cross, Test Layout, Mysuru",
  pincode: "570001",
  idType: "pan",
  idNumber: testPan(),
  mobile: testMobile(),
  reporterType: "staff",
  outlet: "Test Suite Times",
  experience: "3_5",
  state: "KA",
  district: "Mysuru",
  city: "Mysuru",
  languages: ["kn", "en"],
  about: "I cover civic news from my ward for the test suite.",
  links: ["https://www.example.com/portfolio"],
  pledgeSignature: name,
  acceptPledge: true,
});

/** Applies for a Press Pass through the API (instant Trainee). */
export async function applyPressPass(c: Client, name = "Test Publisher"): Promise<PressPass> {
  const res = await c.req("/api/press-pass", { json: PASS_APPLICATION(name) });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await json<{ pressPass: PressPass }>(res)).pressPass;
}

/** Test-only shortcut for this file's own fixture: set a reporter's level directly. */
export async function setFixtureLevel(userId: string, level: ReporterLevel): Promise<void> {
  await db.update(pressPass).set({ level }).where(eq(pressPass.userId, userId));
  await db.update(userTable).set({ reporterLevel: level }).where(eq(userTable.id, userId));
}

/**
 * An onboarded Reporter: applies for a Press Pass through the API (Trainee), then — for the default
 * "verified" level — is promoted directly in the database (own fixture only) so stories go live instantly.
 */
export async function reporterUser(app: App, options: { level?: ReporterLevel; username?: string } = {}): Promise<OnboardedClient> {
  const c = await onboardedUser(app, options.username);
  await applyPressPass(c);
  if ((options.level ?? "verified") === "verified") await setFixtureLevel(c.userId, "verified");
  return c;
}

/** Logs in with email + password (the Log in page's form) and returns a fresh client carrying that session. */
export async function logIn(app: App, email: string, userId: string): Promise<Client & { userId: string }> {
  const c = client(app);
  const res = await c.req("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
  expect(res.status, await res.clone().text()).toBe(200);
  return Object.assign(c, { userId });
}

/**
 * An Editor Desk fixture made the real way: its address is listed in ADMIN_EMAILS, it signs up (still a Reader —
 * an unverified address never becomes admin) and the operator command verifies it (`npm run admin:verify`), which
 * signs it out; the Desk then needs a typed email + password sign-in (lib/desk-sign-in.ts).
 */
export async function adminUser(app: App): Promise<OnboardedClient> {
  const email = testEmail(`desk${randomLetters(10)}`);
  adminEmails.add(email);
  fixtureAdminEmails.add(email);
  const signedUp = await signUp(app, email);
  expect((await verifyEmailAddress(email)).promoted).toBe(true);
  const c = await logIn(app, email, signedUp.userId);
  const username = testUsername("desk");
  const user = await onboard(c, username, "Desk Editor");
  expect(user.role).toBe("admin");
  return Object.assign(c, { user, username });
}

export const LONG_BODY =
  "<p>City officials confirmed on Tuesday that the new riverside tram line will open next spring, ahead of schedule.</p><h2>What changes</h2><ul><li>Six new stops</li><li>Trams every 7 minutes</li></ul>";

export async function coverOf(c: Client) {
  const res = await upload(c, "cover");
  expect(res.status).toBe(201);
  const cover = await json<UploadedImage>(res);
  return { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl };
}

export async function publishArticle(
  c: Client,
  title = `Riverside tram line opens next spring ${randomLetters(5)}`,
  category: SaveArticleInput["category"] = "national",
): Promise<ArticleDetail> {
  const cover = await coverOf(c);
  const res = await c.req("/api/articles", {
    json: { title, bodyHtml: LONG_BODY, cover, articleImage: cover, linkUrl: "https://www.example.com/transit", category, action: "publish" },
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const body = await json<SaveArticleResponse>(res);
  if (body.status !== "published") throw new Error("expected a published article");
  return body.article;
}

export function freshApp(): App {
  return createApp({ logRequests: false });
}

/** Waits until `predicate` holds (polling), or fails after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, timeoutMs = 10_000, label = "condition"): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
