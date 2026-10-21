import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError } from "../lib/errors.js";
import { sanitizeArticleHtml } from "../lib/sanitize.js";
import { decryptToken, encryptToken } from "../lib/social-crypto.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireReporter } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { aiDescribeSchema, aiKeySchema, isPressLanguage, PRESS_LANGUAGE_LABELS, type AiDescribeResult, type AiStatus } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/*
 * "Generate with AI" in the composer (owner 2026-10-14): each reporter pastes their OWN Gemini API key (Google AI
 * Studio). It is checked with Google, stored encrypted, and only ever used here, server side, to write a story's
 * description from its headline and the reporter's notes.
 */

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const keyMissing = () => new ApiError(409, "gemini_key_missing", "Add your Gemini API key first");

async function storedKey(userId: string): Promise<string | null> {
  const [row] = await db.select({ enc: user.geminiKeyEnc }).from(user).where(eq(user.id, userId)).limit(1);
  if (!row?.enc) return null;
  try {
    return decryptToken(row.enc);
  } catch {
    return null;
  }
}

type ModelList = { models?: { name?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };

/** Per key (hash): the model that last answered, kept for an hour. */
const workingModel = new Map<string, { model: string; at: number }>();
const MODEL_TTL_MS = 60 * 60_000;
const keyId = (key: string) => createHash("sha256").update(key).digest("hex");

/** "models/gemini-3.8-flash" → [3, 8]; null for anything that isn't a plain stable flash model. */
function flashVersion(name: string): number[] | null {
  const match = /^models\/gemini-(\d+(?:\.\d+)*)-flash$/.exec(name);
  return match?.[1] ? match[1].split(".").map(Number) : null;
}

/** Compares versions part by part: [3, 8] > [3, 5] > [2, 5]. */
function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The models to try, best first: GEMINI_MODEL when set; else the one that last answered for this key, then this key's
 * stable "gemini-<version>-flash" models, newest first (owner 2026-10-14: Google retires old models for new keys, and
 * the very newest ones can hang — so a model that doesn't answer in time is skipped for the next).
 */
async function candidateModels(key: string): Promise<string[]> {
  if (env.GEMINI_MODEL) return [env.GEMINI_MODEL.replace(/^models\//, "")];
  const found: { name: string; version: number[] }[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${GEMINI}/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) break;
    const data = (await res.json().catch(() => null)) as ModelList | null;
    for (const model of data?.models ?? []) {
      const version = model.name ? flashVersion(model.name) : null;
      if (model.name && version && model.supportedGenerationMethods?.includes("generateContent")) found.push({ name: model.name, version });
    }
    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }
  const names = found.sort((x, y) => compareVersions(y.version, x.version)).map((m) => m.name.replace(/^models\//, ""));
  const cached = workingModel.get(keyId(key));
  const first = cached && Date.now() - cached.at < MODEL_TTL_MS ? [cached.model] : [];
  return [...new Set([...first, ...names])].slice(0, 4);
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gemini's plain text → the editor's paragraphs (blank-line separated; "## " lines become subheadings). */
function toHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (/^#{1,3}\s/.test(block) ? `<h2>${escapeHtml(block.replace(/^#{1,3}\s+/, ""))}</h2>` : `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`))
    .join("");
}

export function aiRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // GET /api/ai/status → { hasKey }
  app.get("/status", requireReporter, async (c) => {
    const body: AiStatus = { hasKey: (await storedKey(mustViewer(c).id)) !== null };
    return c.json(body);
  });

  // PUT /api/ai/key { key } → { hasKey: true } — checked with Google first (400 `gemini_key_invalid`).
  app.put("/key", requireReporter, rateLimit(limiter, "ai-key", { limit: 10, windowMs: 60 * 60_000 }, "user"), async (c) => {
    const { key } = await readJson(c, aiKeySchema);
    const res = await fetch(`${GEMINI}/models?pageSize=1`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!res) throw new ApiError(502, "gemini_unreachable", "Couldn't reach Google to check the key. Try again.");
    if (!res.ok) throw new ApiError(400, "gemini_key_invalid", "Google didn't accept this key. Copy it again from AI Studio.", { key: "Google didn't accept this key" });
    await db.update(user).set({ geminiKeyEnc: encryptToken(key) }).where(eq(user.id, mustViewer(c).id));
    return c.json({ hasKey: true } satisfies AiStatus);
  });

  // DELETE /api/ai/key → { hasKey: false }
  app.delete("/key", requireReporter, async (c) => {
    await db.update(user).set({ geminiKeyEnc: null }).where(eq(user.id, mustViewer(c).id));
    return c.json({ hasKey: false } satisfies AiStatus);
  });

  // POST /api/ai/describe { title, notes, language? } → { html }
  app.post("/describe", requireReporter, rateLimit(limiter, "ai-describe", { limit: 30, windowMs: 60 * 60_000 }, "user"), async (c) => {
    const input = await readJson(c, aiDescribeSchema);
    const key = await storedKey(mustViewer(c).id);
    if (!key) throw keyMissing();
    const language = input.language && isPressLanguage(input.language) ? PRESS_LANGUAGE_LABELS[input.language] : null;
    const system = [
      "You are a news reporter's writing assistant for WebNEWS, an Indian news platform.",
      "Write the body of a news story from the headline and the reporter's notes.",
      "Use ONLY facts in the notes: never invent names, numbers, quotes, places or dates. If something is unknown, leave it out.",
      "Neutral, clear news style: the most important facts first, then details. 3–6 short paragraphs, 120–350 words.",
      "Plain text only: paragraphs separated by a blank line, no title, no markdown, no bullet points.",
      language ? `Write in ${language}.` : "Write in the same language as the headline.",
    ].join(" ");
    const call = (model: string) =>
      fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: `Headline: ${input.title}\n\nReporter's notes:\n${input.notes}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
    // Newest first; a model that hangs, is gone (404) or busy (5xx) is skipped for the next one.
    let res: Response | null = null;
    for (const model of await candidateModels(key)) {
      res = await call(model);
      if (res?.ok) {
        workingModel.set(keyId(key), { model, at: Date.now() });
        break;
      }
      if (res && res.status !== 404 && res.status < 500 && !(res.status === 400 && /no longer available|not found|not supported/i.test(await res.clone().text().catch(() => "")))) break;
    }
    if (!res) throw new ApiError(502, "gemini_unreachable", "Gemini didn't answer in time. Try again in a minute.");
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      error?: { message?: string; status?: string };
    } | null;
    if (!res.ok) {
      if ((res.status === 400 && data?.error?.status === "INVALID_ARGUMENT" && /api key/i.test(data.error.message ?? "")) || res.status === 401 || res.status === 403) {
        throw new ApiError(409, "gemini_key_invalid", "Gemini rejected your key. Add it again.");
      }
      if (res.status === 429) throw new ApiError(429, "gemini_quota", "Your Gemini key hit its limit. Wait a minute and try again.");
      throw new ApiError(502, "gemini_failed", data?.error?.message ?? "Gemini couldn't write it. Try again.");
    }
    const text = (data?.candidates?.[0]?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
    if (!text) throw new ApiError(502, "gemini_empty", "Gemini didn't return any text. Add more notes and try again.");
    const body: AiDescribeResult = { html: sanitizeArticleHtml(toHtml(text)) };
    return c.json(body);
  });

  return app;
}
