import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { auth, CLIENT_IP_HEADER } from "../auth.js";
import { db } from "../db/client.js";
import { user, verification } from "../db/schema.js";
import { env } from "../env.js";
import { fromNativeApp, withBrowserSessionCookies } from "../lib/browser-session-cookie.js";
import { hasPasswordLogin } from "../lib/desk-sign-in.js";
import { ApiError, validationError } from "../lib/errors.js";
import { CHECK_PREFIX, type CheckValue, findCheck, setStatus } from "../lib/whatsapp-check.js";
import { sendWhatsAppText, validWebhookSignature, whatsAppChatLink } from "../lib/whatsapp.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { PASSWORD_RULES, WEAK_PASSWORD_MESSAGE, isPasswordStrongEnough } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/*
 * WhatsApp number + password (owner 2026-10-23). The number is proved once, the other way round from an OTP:
 *
 *  1. POST /api/phone-auth/check  { phoneNumber } → "password" (verified, has a password: ask for it) or "verify".
 *  2. POST /api/phone-auth/start  { phoneNumber } → a check id and a wa.me link: WhatsApp opens a chat with our
 *     business number, "Verify my WebNEWS number: WN-XXXXXX" typed in. They press Send.
 *  3. Meta calls POST /api/whatsapp/webhook with the message and the number it came from. Same number as typed → the
 *     check is "verified" and we answer in the chat ("✅ Number verified"); another number → we say so there.
 *  4. GET /api/phone-auth/status/:id — the page asks every couple of seconds until it's verified.
 *  5. POST /api/phone-auth/complete { id, password } → the account (created on first verify) gets that password and is
 *     signed in. Forgot password = the same steps again.
 *
 * Next time: number + password (Better Auth's POST /api/auth/sign-in/phone-number). A check is a `verification` row
 * (identifier "whatsapp:<code>", value JSON) living CHECK_MINUTES; its id is the "code" Better Auth's phone verify
 * receives (auth.ts verifyOTP), so only a WhatsApp-confirmed check ever signs anyone in. Without the WhatsApp keys
 * (development) a check confirms itself after DEV_CONFIRM_MS.
 */

const CHECK_MINUTES = 15;
const DEV_CONFIRM_MS = 4000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const E164 = /^\+[1-9]\d{7,14}$/;

const RULE = { limit: 10, windowMs: 10 * 60_000 };
const STATUS_RULE = { limit: 120, windowMs: 60_000 };

function newCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

function phoneFrom(body: unknown): string {
  const value = typeof (body as { phoneNumber?: unknown })?.phoneNumber === "string" ? (body as { phoneNumber: string }).phoneNumber.trim() : "";
  if (!E164.test(value)) throw validationError({ phoneNumber: "Enter a valid WhatsApp number" });
  return value;
}

export function phoneAuthRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  app.post("/check", rateLimit(limiter, "phone-check", { limit: 30, windowMs: 60_000 }, "ip"), async (c) => {
    const phoneNumber = phoneFrom(await c.req.json().catch(() => null));
    const [account] = await db
      .select({ id: user.id, verified: user.phoneNumberVerified })
      .from(user)
      .where(eq(user.phoneNumber, phoneNumber))
      .limit(1);
    const ready = Boolean(account?.verified && (await hasPasswordLogin(db, account.id)));
    return c.json({ status: ready ? "password" : "verify", existing: Boolean(account) });
  });

  app.post("/start", rateLimit(limiter, "phone-start", RULE, "ip"), async (c) => {
    const phoneNumber = phoneFrom(await c.req.json().catch(() => null));
    const id = randomUUID();
    const code = `WN-${newCode()}`;
    const value: CheckValue = { phone: phoneNumber, status: "pending" };
    await db.insert(verification).values({
      id,
      identifier: `${CHECK_PREFIX}${code}`,
      value: JSON.stringify(value),
      expiresAt: new Date(Date.now() + CHECK_MINUTES * 60_000),
    });
    if (!env.whatsappEnabled) {
      if (env.isProduction) throw new ApiError(503, "whatsapp_unavailable", "WhatsApp verification isn't available right now. Please try again later.");
      console.log(`[whatsapp] not configured — ${phoneNumber} (${code}) counts as verified in ${DEV_CONFIRM_MS / 1000} s`);
      setTimeout(() => void setStatus(id, value, "verified").catch(() => {}), DEV_CONFIRM_MS);
    }
    return c.json({ id, code, link: whatsAppChatLink(`Verify my WebNEWS number: ${code}`) });
  });

  app.get("/status/:id", rateLimit(limiter, "phone-status", STATUS_RULE, "ip"), async (c) => {
    const check = await findCheck(c.req.param("id")).catch(() => null);
    return c.json({ status: check ? check.value.status : "expired" });
  });

  app.post("/complete", rateLimit(limiter, "phone-complete", RULE, "ip"), async (c) => {
    const body = (await c.req.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < PASSWORD_RULES.min || password.length > PASSWORD_RULES.max) {
      throw validationError({ password: `Use ${PASSWORD_RULES.min} to ${PASSWORD_RULES.max} characters` });
    }
    if (!isPasswordStrongEnough(password)) throw validationError({ password: WEAK_PASSWORD_MESSAGE });
    const check = await findCheck(id).catch(() => null);
    if (!check || check.value.status !== "verified") {
      throw new ApiError(400, "not_verified", "This number isn't verified yet. Send the code on WhatsApp first.");
    }

    // Better Auth's own phone verify: creates the account the first time, marks the number verified, signs in.
    const response = await auth.handler(
      new Request(new URL("/api/auth/phone-number/verify", env.FRONTEND_URL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: env.FRONTEND_URL,
          [CLIENT_IP_HEADER]: c.get("clientIp") ?? "",
          "User-Agent": c.req.header("user-agent") ?? "",
        },
        body: JSON.stringify({ phoneNumber: check.value.phone, code: id }),
      }),
    );
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(response.status === 403 ? 403 : 400, "verify_failed", error?.message ?? "We couldn't sign you in. Please try again.");
    }
    const { user: account } = (await response.json()) as { user: { id: string } };

    const ctx = await auth.$context;
    const hash = await ctx.password.hash(password);
    if (await hasPasswordLogin(db, account.id)) await ctx.internalAdapter.updatePassword(account.id, hash);
    else await ctx.internalAdapter.linkAccount({ userId: account.id, providerId: "credential", accountId: account.id, password: hash });

    const signedIn = new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    for (const cookie of response.headers.getSetCookie()) signedIn.headers.append("set-cookie", cookie);
    return fromNativeApp(c.req.header("user-agent")) ? signedIn : withBrowserSessionCookies(signedIn);
  });

  return app;
}

/** Meta's WhatsApp webhook: the setup handshake (GET) and incoming messages (POST). */
export function whatsAppWebhookRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/webhook", (c) => {
    const ok = c.req.query("hub.mode") === "subscribe" && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && c.req.query("hub.verify_token") === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    return ok ? c.text(c.req.query("hub.challenge") ?? "") : c.text("Forbidden", 403);
  });

  app.post("/webhook", async (c) => {
    const raw = await c.req.text();
    if (!validWebhookSignature(raw, c.req.header("x-hub-signature-256"))) return c.text("Bad signature", 401);
    type Message = { from?: string; type?: string; text?: { body?: string } };
    let payload: { entry?: { changes?: { value?: { messages?: Message[] } }[] }[] } = {};
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return c.text("ok");
    }
    const messages = (payload.entry ?? []).flatMap((entry) => (entry.changes ?? []).flatMap((change) => change.value?.messages ?? []));
    for (const message of messages) {
      const from = (message.from ?? "").replace(/\D/g, "");
      const code = /\bWN-([A-Z0-9]{6})\b/i.exec(message.text?.body ?? "")?.[0]?.toUpperCase();
      if (!from || !code) continue;
      const [row] = await db
        .select()
        .from(verification)
        .where(and(eq(verification.identifier, `${CHECK_PREFIX}${code}`), gt(verification.expiresAt, new Date())))
        .limit(1);
      if (!row) {
        await sendWhatsAppText(from, "This code has expired. Go back to WebNEWS and tap \"Verify on WhatsApp\" again.");
        continue;
      }
      const value = JSON.parse(row.value) as CheckValue;
      if (value.phone.replace(/\D/g, "") !== from) {
        await setStatus(row.id, value, "wrong_number");
        await sendWhatsAppText(from, `This code is for ${value.phone}. Send it from the WhatsApp of that number.`);
        continue;
      }
      await setStatus(row.id, value, "verified");
      await sendWhatsAppText(from, "✅ Your number is verified. Go back to WebNEWS to set your password.");
    }
    return c.text("ok");
  });

  return app;
}
