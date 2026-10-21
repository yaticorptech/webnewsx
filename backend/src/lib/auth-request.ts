import type { Context } from "hono";
import { CLIENT_IP_HEADER } from "../auth.js";
import { LIMITS } from "../shared/contracts.js";
import { ApiError } from "./errors.js";
import type { AppEnv } from "../types.js";

const SIGN_UP_PATH = "/api/auth/sign-up/email";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Sign-up rule: the UI collects only email + password. Better Auth requires a `name` string, so a
 * missing/non-string name becomes "" (the display name is chosen during onboarding), and a
 * client-supplied `image` is dropped (avatars only come from our uploads or Google).
 */
export function normalizeSignUpBody(body: Record<string, unknown>): Record<string, unknown> {
  const { image: _image, name, ...rest } = body;
  return { ...rest, name: typeof name === "string" ? name.trim().slice(0, LIMITS.nameMax) : "" };
}

/**
 * The request handed to Better Auth: our TRUST_PROXY-aware client IP is stamped into an internal
 * header (overwriting anything the client sent) for its rate limiter, and email sign-ups — JSON only
 * (415 otherwise) — are normalized with {@link normalizeSignUpBody}.
 */
export async function toAuthRequest(c: Context<AppEnv>): Promise<Request> {
  const raw = c.req.raw;
  if (raw.method !== "POST" || c.req.path !== SIGN_UP_PATH) {
    raw.headers.set(CLIENT_IP_HEADER, c.get("clientIp"));
    return raw;
  }
  // Only JSON sign-ups are normalized, so nothing else may reach Better Auth (e.g. a form body carrying `image`).
  const mediaType = (raw.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Send the sign-up as application/json");
  }

  const headers = new Headers(raw.headers);
  headers.set(CLIENT_IP_HEADER, c.get("clientIp"));
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    body = null;
  }
  // Invalid JSON / non-objects are passed on unchanged in spirit: Better Auth answers with its own 400.
  const payload = isPlainObject(body) ? JSON.stringify(normalizeSignUpBody(body)) : "null";
  return new Request(raw.url, { method: "POST", headers, body: payload });
}
