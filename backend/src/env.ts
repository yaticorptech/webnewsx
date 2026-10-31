import { existsSync } from "node:fs";
import { z } from "zod";
import { BACKEND_ROOT, fromBackendRoot } from "./lib/paths.js";

// Load backend/.env without overriding variables that are already set in the real environment.
const envFile = fromBackendRoot(".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Listen address. Default: loopback only outside production (the dev API is never exposed on the LAN). */
  HOST: optionalString,
  /** The ONE database (tests included — they only touch fixtures they create). */
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a postgres:// URL" }),
  /** Optional Redis (redis://…) for the shared read cache (lib/cache.ts); without it the cache is in this process. */
  REDIS_URL: optionalString,
  FRONTEND_URL: z
    .url()
    .default("http://localhost:3000")
    .transform((u) => u.replace(/\/+$/, "")),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters (use 32+)"),
  COOKIE_DOMAIN: optionalString,
  /**
   * Number of trusted proxies in front of this API that APPEND to X-Forwarded-For (0 = ignore the header and use
   * the socket address). The client IP is the entry that many positions from the right. "true"/"false" = 1/0.
   */
  TRUST_PROXY: z
    .preprocess(
      (value) => (value === "true" ? "1" : value === "false" ? "0" : blankToUndefined(value)),
      z.coerce.number().int().min(0).max(10).default(0),
    ),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  /** Sign in with LinkedIn (optional): a LinkedIn app with "Sign In with LinkedIn using OpenID Connect". */
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
  /** Sign in with X (optional, owner 2026-10-23): an X developer app's OAuth 2.0 Client ID and Client Secret. */
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  /**
   * WhatsApp number check (owner 2026-10-23): the reader taps "Verify on WhatsApp", WhatsApp opens a chat with our
   * business number with a one-time code typed in, they press Send, and Meta's webhook tells us which number sent it
   * (routes/phone-auth.ts). WHATSAPP_BUSINESS_NUMBER is that number in digits (the wa.me link); the Cloud API's phone
   * number id + System User token send the "Number verified" reply; WHATSAPP_WEBHOOK_VERIFY_TOKEN is the string typed
   * into the webhook setup. Without them (development) every check passes by itself after a few seconds.
   */
  WHATSAPP_BUSINESS_NUMBER: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalString,
  /**
   * Transactional email (password reset) through Resend (https://resend.com). Without a key the email isn't sent:
   * in development its link is printed to this terminal instead (lib/mail.ts).
   */
  RESEND_API_KEY: optionalString,
  /** Where Contact us messages are emailed (they're always kept in the database too). */
  CONTACT_INBOX: z.preprocess(blankToUndefined, z.string().trim().email().default("contact@webnews.in")),
  /** Sender, e.g. `WebNEWS <no-reply@webnews.in>` (the domain must be verified in Resend). */
  MAIL_FROM: z.preprocess(blankToUndefined, z.string().trim().default("WebNEWS <onboarding@resend.dev>")),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_PUBLIC_BASE_URL: optionalUrl,
  LOCAL_UPLOAD_DIR: z.preprocess(blankToUndefined, z.string().default(".data/uploads")),
  /** Press meet recordings (private: only their reporter replays them, through the API). Needs a persistent disk. */
  RECORDINGS_DIR: z.preprocess(blankToUndefined, z.string().default(".data/recordings")),
  /** Press meet reports organizers upload when booking (owner 2026-10-05) — private, served only to who may see them. */
  PRESS_MEET_REPORTS_DIR: z.preprocess(blankToUndefined, z.string().default(".data/press-meet-reports")),
  /** Optional TURN relay for the press meet room (comma-separated turn: / turns: URLs) — needed behind strict NATs. */
  TURN_URLS: optionalString,
  TURN_USERNAME: optionalString,
  TURN_CREDENTIAL: optionalString,
  /**
   * Phone push notifications (owner 2026-10-02) through Firebase Cloud Messaging: the Firebase project's service
   * account key — a file path (relative to backend/) or the JSON itself (for hosts without files). Without one, no
   * pushes are sent (the bell still works).
   */
  FIREBASE_SERVICE_ACCOUNT_FILE: optionalString,
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
  /** Local testing only (ignored in production): organizers can start a press meet any time, not just 10 min before. */
  PRESS_MEET_START_ANYTIME: z.preprocess(blankToUndefined, z.enum(["0", "1"]).default("0")).transform((v) => v === "1"),
  /** Comma-separated emails that become Editor Desk (admin) on sign-up / sign-in (SPEC §3.11). */
  ADMIN_EMAILS: z.preprocess(blankToUndefined, z.string().default("")),
  /** Razorpay (payments are not connected yet — the provider is a stub until the owner enables it). */
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  /**
   * "Generate with AI" (owner 2026-10-14): a fixed Gemini model for the reporters' own keys. Unset (the default) = the
   * newest "gemini-<version>-flash" the key can use, looked up from Google (models get retired for new keys).
   */
  GEMINI_MODEL: optionalString,
  /**
   * Auto-posting to Facebook Pages (Facebook Login) and Instagram (Instagram Login) — one Meta app (developers.facebook.com).
   * The Instagram App ID / secret are the ones shown under the app's Instagram → API setup with Instagram login.
   */
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  /** GIFs in comments (owner 2026-10-31): a GIPHY API key (developers.giphy.com → Create an API key). */
  GIPHY_API_KEY: optionalString,
  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  META_GRAPH_VERSION: z.preprocess(blankToUndefined, z.string().regex(/^v\d+\.\d+$/).default("v23.0")),
  /**
   * Testing Instagram on this Mac (owner 2026-10-05): Instagram's login returns only to https addresses, so
   * `npm run tunnel:instagram` (scripts/instagram-tunnel.mjs) opens a temporary https tunnel and sets this to it.
   * Ignored in production.
   */
  INSTAGRAM_TUNNEL_URL: z.preprocess(blankToUndefined, z.url().transform((u) => u.replace(/\/+$/, "")).optional()),
  /**
   * Publisher websites (owner 2026-10-29): a site's domain is added to the frontend's Vercel project through the
   * Vercel API. Without a token the owner adds domains by hand in the Vercel dashboard.
   */
  VERCEL_TOKEN: optionalString,
  VERCEL_PROJECT_ID: z.preprocess(blankToUndefined, z.string().default("prj_ZzVMaYiXGeGyDBAls4HvgfmW9I20")),
  /** The team's id (`team_…`) or slug. */
  VERCEL_TEAM: z.preprocess(blankToUndefined, z.string().default("yaticorptechs-projects")),
  LOG_REQUESTS: z.preprocess(blankToUndefined, z.enum(["0", "1"]).default("1")).transform((v) => v === "1"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Only names + messages: never echo values (they may be secrets).
  const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid backend environment (see backend/.env.example):\n${details}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  LOCAL_UPLOAD_DIR: fromBackendRoot(raw.LOCAL_UPLOAD_DIR),
  RECORDINGS_DIR: fromBackendRoot(raw.RECORDINGS_DIR),
  PRESS_MEET_REPORTS_DIR: fromBackendRoot(raw.PRESS_MEET_REPORTS_DIR),
  HOST: raw.HOST ?? (raw.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  isProduction: raw.NODE_ENV === "production",
  pressMeetStartAnytime: raw.PRESS_MEET_START_ANYTIME && raw.NODE_ENV !== "production",
  isTest: raw.NODE_ENV === "test" || Boolean(process.env.VITEST),
  /** Emails are really sent only with a Resend key (lib/mail.ts). */
  mailEnabled: Boolean(raw.RESEND_API_KEY),
  /** Connect Facebook / Instagram (auto-post) is available only with that app's keys. */
  facebookEnabled: Boolean(raw.META_APP_ID && raw.META_APP_SECRET),
  instagramEnabled: Boolean(raw.INSTAGRAM_APP_ID && raw.INSTAGRAM_APP_SECRET),
  instagramTunnelUrl: raw.NODE_ENV === "production" ? undefined : raw.INSTAGRAM_TUNNEL_URL,
  /** "Continue with Google" is available only when both credentials are set. */
  googleEnabled: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  /** "Continue with LinkedIn" (owner 2026-10-22), only with its keys. Facebook login shares the Meta app (META_APP_ID). */
  linkedinEnabled: Boolean(raw.LINKEDIN_CLIENT_ID && raw.LINKEDIN_CLIENT_SECRET),
  xEnabled: Boolean(raw.X_CLIENT_ID && raw.X_CLIENT_SECRET),
  /** Numbers are really checked on WhatsApp only with the business number and the Cloud API keys (lib/whatsapp.ts). */
  whatsappEnabled: Boolean(raw.WHATSAPP_BUSINESS_NUMBER && raw.WHATSAPP_PHONE_NUMBER_ID && raw.WHATSAPP_ACCESS_TOKEN),
  FIREBASE_SERVICE_ACCOUNT_FILE: raw.FIREBASE_SERVICE_ACCOUNT_FILE ? fromBackendRoot(raw.FIREBASE_SERVICE_ACCOUNT_FILE) : undefined,
  /** Phone pushes are sent only with a Firebase service account (lib/push.ts). */
  pushEnabled: Boolean(raw.FIREBASE_SERVICE_ACCOUNT_FILE || raw.FIREBASE_SERVICE_ACCOUNT_JSON),
  /** Images go to Cloudflare R2 only when ALL five R2 variables are set; otherwise to LOCAL_UPLOAD_DIR. */
  r2Enabled: Boolean(raw.R2_ACCOUNT_ID && raw.R2_ACCESS_KEY_ID && raw.R2_SECRET_ACCESS_KEY && raw.R2_BUCKET && raw.R2_PUBLIC_BASE_URL),
  vercelEnabled: Boolean(raw.VERCEL_TOKEN),
  secureCookies: raw.FRONTEND_URL.startsWith("https://"),
  /** Lower-cased ADMIN_EMAILS entries. */
  adminEmails: raw.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@")),
  backendRoot: BACKEND_ROOT,
} as const;

export type Env = typeof env;
