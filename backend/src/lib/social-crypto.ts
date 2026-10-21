import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import type { SocialProvider } from "../shared/contracts.js";

/*
 * Connected social accounts (owner 2026-09-30): their access tokens are encrypted at rest (AES-256-GCM), and the
 * login round trip carries a signed `state` (whose login, which provider, 10 minutes) so a callback can't be forged.
 * Both keys are derived from BETTER_AUTH_SECRET — no extra secret to manage.
 */

const encryptionKey = createHash("sha256").update(`webnews:social-token:${env.BETTER_AUTH_SECRET}`).digest();
const stateKey = createHash("sha256").update(`webnews:social-state:${env.BETTER_AUTH_SECRET}`).digest();

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string): string {
  const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !body) throw new Error("malformed token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

const STATE_TTL_MS = 10 * 60_000;
const TICKET_TTL_MS = 5 * 60_000;

function sign(payload: string): string {
  return createHmac("sha256", stateKey).update(payload).digest("base64url");
}

function seal(parts: unknown[]): string {
  const payload = Buffer.from(JSON.stringify(parts)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal(value: string | undefined): unknown[] | null {
  const [payload, signature] = (value ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parts = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    return Array.isArray(parts) ? parts : null;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString("base64url");

/**
 * The login round trip's `state`: whose connection, which provider, the browser's nonce (its `wn_social` cookie —
 * the callback must come back to the same browser, so nobody can attach their own account to someone else's) and
 * whether it started in the phone app (then the callback shows a "go back to the app" page).
 */
export function makeOAuthState(userId: string, provider: SocialProvider, nonce: string, app: boolean): string {
  return seal(["s", userId, provider, Date.now() + STATE_TTL_MS, nonce, app ? 1 : 0]);
}

export function readOAuthState(state: string | undefined, provider: SocialProvider): { userId: string; nonce: string; app: boolean } | null {
  const parts = unseal(state);
  if (!parts || parts[0] !== "s") return null;
  const [, userId, which, expires, nonce, app] = parts;
  if (typeof userId !== "string" || which !== provider || typeof expires !== "number" || Date.now() >= expires || typeof nonce !== "string") return null;
  return { userId, nonce, app: app === 1 };
}

/**
 * A one-time pass (5 minutes) for the phone app: Meta doesn't allow its login inside apps' web views, so the app opens
 * Connect in the phone's browser — which isn't logged in to WebNEWS — with this pass naming the reporter.
 */
export function makeConnectTicket(userId: string, provider: SocialProvider): string {
  return seal(["t", userId, provider, Date.now() + TICKET_TTL_MS]);
}

export function readConnectTicket(ticket: string | undefined, provider: SocialProvider): string | null {
  const parts = unseal(ticket);
  if (!parts || parts[0] !== "t") return null;
  const [, userId, which, expires] = parts;
  return typeof userId === "string" && which === provider && typeof expires === "number" && Date.now() < expires ? userId : null;
}
