import { Hono } from "hono";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { normalizeUsername, usernameCandidates } from "../lib/username.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { isUsernameTaken, takenUsernames } from "../queries/users.js";
import { USERNAME_MESSAGES, validateNewUsername, type UsernameCheck } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

const MAX_SUGGESTIONS = 3;

/** Up to 3 AVAILABLE suggestions (letters and dots only) based on the requested name. */
export async function suggestUsernames(base: string): Promise<string[]> {
  const candidates = usernameCandidates(base);
  const taken = await takenUsernames(candidates);
  return candidates.filter((candidate) => !taken.has(candidate)).slice(0, MAX_SUGGESTIONS);
}

/** Format → reserved → taken. The viewer's own current username counts as available. */
export async function checkUsername(raw: string, viewerId: string | null): Promise<UsernameCheck> {
  const username = normalizeUsername(raw);
  // Picking a username: the new pattern applies (owner 2026-10-15).
  const format = validateNewUsername(username);
  if (!format.ok) {
    if (format.code === "reserved") {
      return { available: false, reason: "reserved", code: "reserved", message: format.message, suggestions: await suggestUsernames(username) };
    }
    return { available: false, reason: "invalid", code: format.code, message: format.message, suggestions: [] };
  }
  if (await isUsernameTaken(username, viewerId)) {
    return { available: false, reason: "taken", code: "taken", message: USERNAME_MESSAGES.taken, suggestions: await suggestUsernames(username) };
  }
  return { available: true, message: "Username is available", suggestions: [] };
}

export function usernameRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/username/check?u=
  app.get("/check", rateLimit(limiter, "username-check", RATE_LIMITS.usernameCheck, "ip"), async (c) => {
    const result = await checkUsername(c.req.query("u") ?? "", c.get("viewer")?.id ?? null);
    return c.json(result);
  });

  return app;
}
