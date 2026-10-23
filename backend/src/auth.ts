import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { authSchema, user as userTable } from "./db/schema.js";
import { env } from "./env.js";
import { claimUnverifiedAccount, promoteListedAdmin } from "./lib/admin-emails.js";
import { ADMIN_PASSWORD_ONLY, ADMIN_PASSWORD_ONLY_MESSAGE, DESK_SIGN_IN_PATH, deskSessionExpiry, hasPasswordLogin } from "./lib/desk-sign-in.js";
import { passwordResetMail, sendMail } from "./lib/mail.js";
import { consumeWhatsAppCheck } from "./lib/whatsapp-check.js";
import { isAdminEmail } from "./lib/roles.js";
import { PASSWORD_RULES, PHONE_ACCOUNT_EMAIL_DOMAIN, SELF_DEACTIVATED_REASON, WEAK_PASSWORD_MESSAGE, emailWords, isPasswordStrongEnough } from "./shared/contracts.js";

/** Better Auth error code for sign-in attempts of suspended accounts (403). */
export const ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED";

export function suspendedMessage(reason: string | null): string {
  const why = reason ? ` Reason: ${reason}` : "";
  return `This account has been suspended by the WebNEWS Editor Desk.${why} Contact the WebNEWS team if you think this is a mistake.`;
}

/**
 * Every new session (email sign-in, sign-up auto sign-in, Google callback) passes through here:
 * suspended accounts are refused, and the Editor Desk sign-in rule applies (lib/desk-sign-in.ts): a verified
 * ADMIN_EMAILS account is (re)promoted only by a typed email + password sign-in, an admin account may sign in no
 * other way (Google redirects back to /login with `ADMIN_PASSWORD_ONLY`), and its session lasts DESK_SESSION_HOURS.
 */
export async function beforeSessionCreate(
  session: { userId: string; expiresAt: Date },
  ctx: { path?: string } | null | undefined,
): Promise<{ data: { expiresAt: Date } } | undefined> {
  const [record] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
      role: userTable.role,
      suspendedAt: userTable.suspendedAt,
      suspendReason: userTable.suspendReason,
      username: userTable.username,
    })
    .from(userTable)
    .where(eq(userTable.id, session.userId))
    .limit(1);
  if (!record) return undefined;
  // Deactivated by its owner (owner 2026-10-23): logging in again brings the account back.
  if (record.suspendedAt && record.suspendReason === SELF_DEACTIVATED_REASON) {
    await db.update(userTable).set({ suspendedAt: null, suspendReason: null }).where(eq(userTable.id, record.id));
  } else if (record.suspendedAt) {
    throw APIError.from("FORBIDDEN", { code: ACCOUNT_SUSPENDED, message: suspendedMessage(record.suspendReason) });
  }
  const typedPassword = ctx?.path === DESK_SIGN_IN_PATH;
  const admin = record.role === "admin" || (typedPassword && (await promoteListedAdmin(record, record.role)));
  if (!admin) return undefined;
  if (!typedPassword) throw APIError.from("FORBIDDEN", { code: ADMIN_PASSWORD_ONLY, message: ADMIN_PASSWORD_ONLY_MESSAGE });
  return { data: { expiresAt: deskSessionExpiry(new Date(session.expiresAt)) } };
}

/** Endpoints that set a new password, and the body field that carries it. */
const NEW_PASSWORD_FIELDS: Record<string, string> = { "/sign-up/email": "password", "/change-password": "newPassword", "/reset-password": "newPassword" };

/**
 * Runs before Better Auth handles a request:
 *  - a new password must rate at least "Good" (owner rule 2026-09-25; shared `scorePassword`, 400 `WEAK_PASSWORD`).
 *    Too short / too long is left to Better Auth's own messages;
 *  - email + password sign-in says what's wrong (owner 2026-10-02): no account with that email (401
 *    `ACCOUNT_NOT_FOUND`), or an account that only signs in with Google (401 `CREDENTIAL_ACCOUNT_NOT_FOUND`) — so
 *    Better Auth's own "invalid email or password" only ever means a wrong password;
 *  - an admin's email + password sign-in is never remembered: Better Auth then sets a browser-session cookie and
 *    doesn't slide the expiry. Decided before the password check, for every address alike (listed addresses too,
 *    since this sign-in may promote them).
 */
/** Owner 2026-10-22: readers sign up and log in with their WhatsApp number or a social account; email + password is the Editor Desk's. */
const EMAIL_SIGN_UP_DISABLED = "EMAIL_SIGN_UP_DISABLED";
const EMAIL_SIGN_IN_DISABLED = "EMAIL_SIGN_IN_DISABLED";
const EMAIL_ONLY_FOR_DESK_MESSAGE = "WebNEWS signs you in with your WhatsApp number or a social account. Email and password are for the Editor Desk.";

const beforeAuthRequest = createAuthMiddleware(async (ctx) => {
  // Email sign-up is for Editor Desk addresses only (the test suite's fixtures still use it).
  if (ctx.path === "/sign-up/email" && !env.isTest) {
    const body = ctx.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isAdminEmail(email)) throw APIError.from("FORBIDDEN", { code: EMAIL_SIGN_UP_DISABLED, message: EMAIL_ONLY_FOR_DESK_MESSAGE });
  }
  const passwordField = NEW_PASSWORD_FIELDS[ctx.path];
  if (passwordField) {
    const body = ctx.body as Record<string, unknown> | undefined;
    const password = body?.[passwordField];
    const email = typeof body?.email === "string" ? body.email : (ctx.context.session?.user.email ?? "");
    if (typeof password === "string" && password.length >= PASSWORD_RULES.min && password.length <= PASSWORD_RULES.max) {
      if (!isPasswordStrongEnough(password, emailWords(email))) {
        throw APIError.from("BAD_REQUEST", { code: "WEAK_PASSWORD", message: WEAK_PASSWORD_MESSAGE });
      }
    }
    return;
  }
  if (ctx.path !== DESK_SIGN_IN_PATH) return;
  const body = ctx.body as Record<string, unknown> | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return;
  const [record] = await db
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(sql`lower(${userTable.email}) = ${email}`)
    .limit(1);
  if (!record) {
    throw APIError.from("UNAUTHORIZED", { code: "ACCOUNT_NOT_FOUND", message: "There's no WebNEWS account with this email." });
  }
  if (!(await hasPasswordLogin(db, record.id))) {
    throw APIError.from("UNAUTHORIZED", {
      code: "CREDENTIAL_ACCOUNT_NOT_FOUND",
      message: "This account uses Google sign-in. Continue with Google instead.",
    });
  }
  if (record.role !== "admin" && !isAdminEmail(email)) {
    if (env.isTest) return;
    throw APIError.from("FORBIDDEN", { code: EMAIL_SIGN_IN_DISABLED, message: EMAIL_ONLY_FOR_DESK_MESSAGE });
  }
  return { context: { body: { ...body, rememberMe: false } } };
});

/** How long a "forgot password" link works. */
const RESET_LINK_MINUTES = 60;

/** Internal header carrying the client IP we resolved (TRUST_PROXY aware) to Better Auth's rate limiter. */
export const CLIENT_IP_HEADER = "x-webnews-client-ip";

/**
 * Better Auth, mounted by the Hono app at /api/auth/*.
 *
 * The browser only ever talks to the frontend origin (Next.js rewrites /api/* here), so
 * `baseURL` is FRONTEND_URL and session cookies are first-party on the frontend domain.
 *
 * Sign-up rule for clients: POST /api/auth/sign-up/email with `{ email, password }` (the Better Auth
 * client typing wants `name`, so the UI sends `name: ""`). A missing name is defaulted to "" by
 * lib/auth-request.ts; the display name, username, bio, photo and Terms are collected by onboarding.
 * Google sign-ups get `name` + `image` from their Google profile and still have to onboard.
 */
export const auth = betterAuth({
  appName: "WebNEWS",
  baseURL: env.FRONTEND_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  // Development: the same dev server reached as 127.0.0.1 too (owner 2026-10-15: Google login said "Invalid origin").
  trustedOrigins: env.isProduction ? [env.FRONTEND_URL] : [env.FRONTEND_URL, env.FRONTEND_URL.replace("//localhost", "//127.0.0.1")],
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  // Profile fields (display name, photo) only change through our own validated endpoints (PATCH /api/me,
  // onboarding) — Better Auth's generic update endpoint would bypass the length and avatar rules.
  disabledPaths: ["/update-user", "/phone-number/send-otp", "/phone-number/request-password-reset", "/phone-number/reset-password"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Forgot password (owner 2026-09-29): POST /request-password-reset emails a one-time link (the answer never says
    // whether the address has an account); it opens /reset-password, where POST /reset-password sets the new password
    // (same strength rule as sign-up, beforeAuthRequest) and signs the account out everywhere. A Google-only account
    // gets a password this way too. The account rules still apply at the next sign-in (suspended, Editor Desk).
    resetPasswordTokenExpiresIn: RESET_LINK_MINUTES * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited: the response time mustn't hint whether the address exists. Failures only reach the log.
      void sendMail(passwordResetMail({ to: user.email, name: user.name, url, minutes: RESET_LINK_MINUTES })).catch((error: unknown) => {
        console.error("[mail] password reset email failed:", error instanceof Error ? error.message : error);
      });
    },
  },
  // Owner 2026-10-22 ("multiple social media accounts"): each provider is offered once its keys are set — Facebook
  // through the Meta app that also auto-posts (META_APP_ID), LinkedIn and X through their own. Google as before.
  socialProviders: {
    ...(env.googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
            prompt: "select_account" as const,
            // Runs only for a Google-authenticated profile, before Better Auth looks the address up: a verified Google
            // address claims an unverified password account registered with it (see claimUnverifiedAccount).
            mapProfileToUser: async (profile: { email: string; email_verified: boolean }) => {
              await claimUnverifiedAccount(profile.email, profile.email_verified);
              return {};
            },
          },
        }
      : {}),
    ...(env.facebookEnabled ? { facebook: { clientId: env.META_APP_ID as string, clientSecret: env.META_APP_SECRET as string } } : {}),
    ...(env.linkedinEnabled ? { linkedin: { clientId: env.LINKEDIN_CLIENT_ID as string, clientSecret: env.LINKEDIN_CLIENT_SECRET as string } } : {}),
    // X (owner 2026-10-23) shares the email only if the app asks for it; otherwise the account gets a placeholder address.
    ...(env.xEnabled ? { twitter: { clientId: env.X_CLIENT_ID as string, clientSecret: env.X_CLIENT_SECRET as string } } : {}),
  },
  // Phone sign-in (owner 2026-10-23): the number is proved once on WhatsApp — the reader sends us a code and Meta's
  // webhook confirms who sent it (routes/phone-auth.ts); the "code" Better Auth's verify gets is that confirmed check's
  // id. A number seen for the first time becomes a new Reader account right there (onboarding then asks for the name
  // and username) and sets a password; after that it's number + password (/sign-in/phone-number). Nothing is ever sent
  // as an OTP: send-otp and the OTP password reset are switched off (disabledPaths) — forgot password = verify again.
  plugins: [
    phoneNumber({
      verifyOTP: ({ phoneNumber: number, code }) => consumeWhatsAppCheck(number, code),
      // Never reached (the paths that send codes are disabled); required by the plugin.
      sendOTP: () => {
        throw APIError.from("FORBIDDEN", { code: "WHATSAPP_VERIFY_ONLY", message: "Verify your number on WhatsApp instead." });
      },
      // E.164: a "+", then 8–15 digits.
      phoneNumberValidator: (value) => /^\+[1-9]\d{7,14}$/.test(value),
      signUpOnVerification: {
        getTempEmail: (value) => `${value.replace(/\D/g, "")}@${PHONE_ACCOUNT_EMAIL_DOMAIN}`,
        getTempName: () => "",
      },
    }),
  ],
  user: {
    additionalFields: {
      username: { type: "string", required: false, input: false },
      bio: { type: "string", required: false, input: false },
      onboardedAt: { type: "date", required: false, input: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
      termsVersion: { type: "string", required: false, input: false },
      role: { type: "string", required: false, input: false, defaultValue: "reader" },
      reporterLevel: { type: "string", required: false, input: false },
      suspendedAt: { type: "date", required: false, input: false },
      suspendReason: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every account starts as a Reader. A listed ADMIN_EMAILS address becomes the Editor Desk only through a typed
        // email + password sign-in once verified (`admin:verify`), never through a Google sign-up (lib/desk-sign-in.ts).
        before: async (data) => ({ data: { ...data, role: "reader" } }),
      },
    },
    session: { create: { before: beforeSessionCreate } },
  },
  hooks: { before: beforeAuthRequest },
  // Logged in until you log out (owner 2026-10-01): a session lasts a year and every day of use extends it, so an account
  // in use never gets signed out. The Editor Desk stays the exception: never remembered, DESK_SESSION_HOURS
  // (beforeAuthRequest, beforeSessionCreate).
  session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 60 * 60 * 24 },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google", "facebook", "linkedin", "twitter"] },
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    // Production keeps Better Auth's strict built-in sign-in/up rule (3 per 10 s per IP). Locally every
    // request comes from one IP (the e2e suite signs up a few users per test on 3 workers, several tabs),
    // so allow more there.
    customRules: {
      // Reset emails: enough for a typo, never an inbox flood (per IP, in every environment).
      "/request-password-reset": { window: 60, max: 3 },
      "/phone-number/verify": { window: 60, max: env.isProduction ? 10 : 100 },
      ...(env.isProduction ? {} : { "/sign-in/*": { window: 10, max: 100 }, "/sign-up/*": { window: 10, max: 100 } }),
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    useSecureCookies: env.secureCookies,
    ...(env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {}),
  },
  telemetry: { enabled: false },
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
